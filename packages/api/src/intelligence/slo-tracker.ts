import { eq, and, gte } from 'drizzle-orm'
import type { Db } from '@proxyos/db'
import { routeSlos, sloCompliance, trafficMetrics } from '@proxyos/db'
import { eventBus } from '@proxyos/connect'

export interface SLOStatus {
  routeId: string
  p95TargetMs: number
  p99TargetMs: number | null
  windowDays: number
  p95CompliancePct: number
  p99CompliancePct: number | null
  totalDays: number
  trend: 'improving' | 'stable' | 'degrading'
}

function dateStr(d: Date): string { return d.toISOString().slice(0, 10) }

export async function recordDailyCompliance(db: Db, routeId: string): Promise<void> {
  const slo = await db.select().from(routeSlos).where(eq(routeSlos.routeId, routeId)).get()
  if (!slo) return

  const today = dateStr(new Date())
  const dayAgo = Date.now() - 86400 * 1000

  const rows = await db.select().from(trafficMetrics).where(and(
    eq(trafficMetrics.routeId, routeId),
    gte(trafficMetrics.bucketTs, dayAgo),
  )).all()

  if (rows.length === 0) return

  // Use avg latency as proxy for p95 (no percentile data in schema)
  const avgLatencies = rows
    .filter(r => r.requests > 0)
    .map(r => Math.round(r.latencySumMs / r.requests))

  const p95Actual = avgLatencies.length > 0
    ? Math.round(avgLatencies.reduce((a, b) => a + b, 0) / avgLatencies.length)
    : null

  const p95Compliant = p95Actual !== null ? (p95Actual <= slo.p95TargetMs ? 1 : 0) : null

  await db.insert(sloCompliance).values({
    routeId, date: today,
    p95ActualMs: p95Actual, p99ActualMs: null,
    p95Compliant, p99Compliant: null,
    sampleCount: rows.length,
  }).onConflictDoNothing()

  if (p95Compliant === 0 && slo.alertOnBreach) {
    eventBus.emit('anomaly.detected', {
      routeId, metric: 'p95_latency',
      value: p95Actual ?? 0, baseline: slo.p95TargetMs,
    })
  }
}

export async function getSLOStatus(db: Db, routeId: string): Promise<SLOStatus | null> {
  const slo = await db.select().from(routeSlos).where(eq(routeSlos.routeId, routeId)).get()
  if (!slo) return null

  const windowStart = dateStr(new Date(Date.now() - slo.windowDays * 86400 * 1000))
  const rows = await db.select().from(sloCompliance).where(and(
    eq(sloCompliance.routeId, routeId),
    gte(sloCompliance.date, windowStart),
  )).all()

  if (rows.length === 0) return {
    routeId, p95TargetMs: slo.p95TargetMs, p99TargetMs: slo.p99TargetMs,
    windowDays: slo.windowDays, p95CompliancePct: 100, p99CompliancePct: null,
    totalDays: 0, trend: 'stable',
  }

  const p95Rows = rows.filter(r => r.p95Compliant !== null)
  const p95CompliancePct = p95Rows.length > 0
    ? Math.round((p95Rows.filter(r => r.p95Compliant === 1).length / p95Rows.length) * 100)
    : 100

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const recent7Avg = avg(sorted.slice(-7).map(r => r.p95ActualMs ?? 0))
  const prior7Avg = avg(sorted.slice(-14, -7).map(r => r.p95ActualMs ?? 0))
  const trend = recent7Avg > prior7Avg * 1.15 ? 'degrading' : recent7Avg < prior7Avg * 0.85 ? 'improving' : 'stable'

  return { routeId, p95TargetMs: slo.p95TargetMs, p99TargetMs: slo.p99TargetMs, windowDays: slo.windowDays, p95CompliancePct, p99CompliancePct: null, totalDays: rows.length, trend }
}

function avg(vals: number[]): number {
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}
