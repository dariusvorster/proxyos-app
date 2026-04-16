import { eq, and, gte } from 'drizzle-orm'
import type { Db } from '@proxyos/db'
import { trafficMetrics } from '@proxyos/db'

export type TrendDirection = 'improving' | 'stable' | 'degrading'

export interface LatencyTrend {
  routeId: string
  daily: { date: string; avgMs: number; requests: number }[]
  trend: TrendDirection
  alert: boolean
  avg7dayMs: number
  avg30dayMs: number
}

function dateStr(d: Date): string { return d.toISOString().slice(0, 10) }

export async function getLatencyTrend(db: Db, routeId: string): Promise<LatencyTrend> {
  const thirtyDaysAgo = Date.now() - 30 * 86400 * 1000

  const rows = await db.select().from(trafficMetrics).where(and(
    eq(trafficMetrics.routeId, routeId),
    gte(trafficMetrics.bucketTs, thirtyDaysAgo),
  )).all()

  const byDay = new Map<string, { sumMs: number; requests: number }>()
  for (const r of rows) {
    const day = dateStr(new Date(r.bucketTs))
    const entry = byDay.get(day) ?? { sumMs: 0, requests: 0 }
    entry.sumMs += r.latencySumMs
    entry.requests += r.requests
    byDay.set(day, entry)
  }

  const daily = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sumMs, requests }]) => ({
      date,
      avgMs: requests > 0 ? Math.round(sumMs / requests) : 0,
      requests,
    }))

  const recent7 = daily.slice(-7)
  const avg7dayMs = avg(recent7.map(d => d.avgMs))
  const avg30dayMs = avg(daily.map(d => d.avgMs))
  const alert = avg30dayMs > 0 && avg7dayMs > avg30dayMs * 1.5

  const prior7 = daily.slice(-14, -7)
  const avg7prior = prior7.length > 0 ? avg(prior7.map(d => d.avgMs)) : avg30dayMs
  const trend: TrendDirection = avg7dayMs > avg7prior * 1.15 ? 'degrading'
    : avg7dayMs < avg7prior * 0.85 ? 'improving' : 'stable'

  return { routeId, daily, trend, alert, avg7dayMs, avg30dayMs }
}

function avg(vals: number[]): number {
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}
