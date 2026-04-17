import { eq } from 'drizzle-orm'
import { routes, healthChecks, trafficMetrics, routeHealthScores, routeSlos, sloCompliance } from '@proxyos/db'
import type { Db } from '@proxyos/db'

async function calculateScore(db: Db, routeId: string): Promise<void> {
  const now = new Date()
  const windowMs = 60 * 60 * 1000 // 1 hour window

  // Recent health checks
  const checks = await db.select().from(healthChecks)
    .where(eq(healthChecks.routeId, routeId))
    .orderBy(healthChecks.checkedAt)
    .limit(60)

  if (checks.length === 0) return

  const healthy = checks.filter(c => c.overallStatus === 'healthy').length
  const uptimePct = Math.round((healthy / checks.length) * 100)

  // p95 latency from recent checks
  const latencies = checks
    .map(c => c.responseTimeMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)
  const p95Ms = latencies.length > 0
    ? latencies[Math.floor(latencies.length * 0.95)] ?? null
    : null

  // Error rate from traffic metrics (last hour)
  const cutoff = Math.floor((Date.now() - windowMs) / 60000)
  const metrics = await db.select().from(trafficMetrics)
    .where(eq(trafficMetrics.routeId, routeId))

  const recent = metrics.filter(m => m.bucketTs >= cutoff)
  const totalReqs = recent.reduce((s, m) => s + m.requests, 0)
  const totalErrors = recent.reduce((s, m) => s + m.errors, 0)
  const errorRatePct = totalReqs > 0 ? Math.round((totalErrors / totalReqs) * 100) : 0

  // SLO compliance
  let sloCompliant = true
  const slo = await db.select().from(routeSlos).where(eq(routeSlos.routeId, routeId)).get()
  if (slo && p95Ms !== null) {
    sloCompliant = p95Ms <= slo.p95TargetMs
  }

  // Composite score: 50% uptime, 30% error rate, 20% SLO
  const uptimeScore = uptimePct
  const errorScore = Math.max(0, 100 - errorRatePct * 5)
  const sloScore = sloCompliant ? 100 : 50
  const score = Math.round(uptimeScore * 0.5 + errorScore * 0.3 + sloScore * 0.2)

  const existing = await db.select().from(routeHealthScores)
    .where(eq(routeHealthScores.routeId, routeId)).get()

  if (existing) {
    await db.update(routeHealthScores).set({
      score,
      uptimePct,
      p95Ms,
      errorRatePct,
      sloCompliant,
      calculatedAt: now,
    }).where(eq(routeHealthScores.routeId, routeId))
  } else {
    await db.insert(routeHealthScores).values({
      routeId,
      score,
      uptimePct,
      p95Ms,
      errorRatePct,
      sloCompliant,
      calculatedAt: now,
    })
  }
}

export function startHealthScorer(db: Db): void {
  const run = async () => {
    const allRoutes = await db.select({ id: routes.id }).from(routes)
    for (const r of allRoutes) {
      await calculateScore(db, r.id).catch(() => {})
    }
  }

  run().catch(() => {})
  setInterval(() => { run().catch(() => {}) }, 5 * 60 * 1000) // every 5 minutes
}
