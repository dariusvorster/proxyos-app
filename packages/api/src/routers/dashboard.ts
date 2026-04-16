import { gte } from 'drizzle-orm'
import { certificates, routes, trafficMetrics } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

export const dashboardRouter = router({
  summary: publicProcedure.query(async ({ ctx }) => {
    const routeRows = await ctx.db.select().from(routes)
    const certRows = await ctx.db.select().from(certificates)
    const since = Date.now() - 24 * 60 * 60 * 1000
    const trafficRows = await ctx.db.select().from(trafficMetrics).where(gte(trafficMetrics.bucketTs, since))
    const requests = trafficRows.reduce((s, r) => s + r.requests, 0)
    const bytes = trafficRows.reduce((s, r) => s + r.bytes, 0)
    const errors = trafficRows.reduce((s, r) => s + r.status5xx, 0)
    const errorRate = requests > 0 ? (errors / requests) * 100 : 0
    const expiringCount = certRows.filter((c) => {
      if (!c.expiresAt) return false
      const d = (new Date(c.expiresAt).getTime() - Date.now()) / 86_400_000
      return d > 0 && d < 30
    }).length
    return {
      totalRoutes: routeRows.length,
      enabledRoutes: routeRows.filter((r) => r.enabled).length,
      requests24h: requests,
      bytes24h: bytes,
      errors24h: errors,
      errorRate24h: errorRate,
      certsExpiring: expiringCount,
      totalCerts: certRows.length,
    }
  }),
})
