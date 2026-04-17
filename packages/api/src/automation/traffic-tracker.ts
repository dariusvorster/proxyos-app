import { desc, eq, gte } from 'drizzle-orm'
import { getDb, routes, trafficMetrics } from '@proxyos/db'

const INTERVAL_MS = 5 * 60_000

async function updateLastTrafficAt(): Promise<void> {
  const db = getDb()
  const since = new Date(Date.now() - 35 * 24 * 60 * 60_000)

  const recent = await db
    .select({ routeId: trafficMetrics.routeId })
    .from(trafficMetrics)
    .where(gte(trafficMetrics.bucketTs, since.getTime()))
    .groupBy(trafficMetrics.routeId)

  const now = new Date()
  for (const { routeId } of recent) {
    // Find the most recent bucket for this route
    const latest = await db
      .select({ bucketTs: trafficMetrics.bucketTs })
      .from(trafficMetrics)
      .where(eq(trafficMetrics.routeId, routeId))
      .orderBy(desc(trafficMetrics.bucketTs))
      .limit(1)
      .get()

    if (latest) {
      await db.update(routes)
        .set({ lastTrafficAt: new Date(latest.bucketTs) })
        .where(eq(routes.id, routeId))
    }
  }
}

export function startTrafficTracker(): void {
  setInterval(() => { void updateLastTrafficAt() }, INTERVAL_MS)
  void updateLastTrafficAt()
}
