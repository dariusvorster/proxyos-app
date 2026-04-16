import { eq, and, gte } from 'drizzle-orm'
import type { Db } from '@proxyos/db'
import { anomalyBaselines, trafficMetrics } from '@proxyos/db'
import { eventBus } from '@proxyos/connect'

export type AnomalyMetric = 'req_per_min' | 'error_rate' | 'p95_latency'

export interface AnomalyDetectorConfig {
  routeId: string
  metric: AnomalyMetric
  sensitivity: number
  minBaselineDays: number
}

const lastAlertTime = new Map<string, number>()
const SUPPRESS_MS = 60 * 60 * 1000

function hourOfWeek(d: Date): number {
  return d.getDay() * 24 + d.getHours()
}

function metricValue(row: typeof trafficMetrics.$inferSelect, metric: AnomalyMetric): number {
  switch (metric) {
    case 'req_per_min': return row.requests
    case 'error_rate': return row.requests > 0 ? Math.round((row.status5xx / row.requests) * 100) : 0
    case 'p95_latency': return row.requests > 0 ? Math.round(row.latencySumMs / row.requests) : 0
  }
}

export async function updateBaseline(db: Db, routeId: string, metric: AnomalyMetric): Promise<void> {
  const now = new Date()
  const slot = hourOfWeek(now)
  const sevenDaysAgo = Date.now() - 7 * 86400 * 1000

  const rows = await db.select().from(trafficMetrics)
    .where(and(
      eq(trafficMetrics.routeId, routeId),
      gte(trafficMetrics.bucketTs, sevenDaysAgo),
    )).all()

  const relevant = rows.filter(r => hourOfWeek(new Date(r.bucketTs)) === slot)
  if (relevant.length < 3) return

  const values = relevant.map(r => metricValue(r, metric))
  const mean = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  const stddev = Math.round(Math.sqrt(variance))

  const existing = await db.select().from(anomalyBaselines).where(and(
    eq(anomalyBaselines.routeId, routeId),
    eq(anomalyBaselines.metric, metric),
    eq(anomalyBaselines.hourOfWeek, slot),
  )).get()

  if (existing) {
    await db.update(anomalyBaselines)
      .set({ mean, stddev, sampleCount: relevant.length, updatedAt: now })
      .where(and(
        eq(anomalyBaselines.routeId, routeId),
        eq(anomalyBaselines.metric, metric),
        eq(anomalyBaselines.hourOfWeek, slot),
      ))
  } else {
    await db.insert(anomalyBaselines).values({ routeId, metric, hourOfWeek: slot, mean, stddev, sampleCount: relevant.length, updatedAt: now })
  }
}

export async function checkAnomaly(db: Db, config: AnomalyDetectorConfig, currentValue: number): Promise<boolean> {
  const now = new Date()
  const slot = hourOfWeek(now)
  const key = `${config.routeId}:${config.metric}`

  const baseline = await db.select().from(anomalyBaselines).where(and(
    eq(anomalyBaselines.routeId, config.routeId),
    eq(anomalyBaselines.metric, config.metric),
    eq(anomalyBaselines.hourOfWeek, slot),
  )).get()

  if (!baseline || baseline.sampleCount < config.minBaselineDays * 24) return false

  const threshold = baseline.mean + config.sensitivity * baseline.stddev
  if (currentValue <= threshold) return false

  const lastAlert = lastAlertTime.get(key) ?? 0
  if (now.getTime() - lastAlert < SUPPRESS_MS) return false

  lastAlertTime.set(key, now.getTime())
  eventBus.emit('anomaly.detected', {
    routeId: config.routeId, metric: config.metric,
    value: currentValue, baseline: baseline.mean,
  })
  return true
}
