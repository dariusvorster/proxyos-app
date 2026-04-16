import { and, desc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { accessLog, routes, trafficMetrics } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

export const analyticsRouter = router({
  summary: publicProcedure
    .input(z.object({ routeId: z.string(), windowMinutes: z.number().min(1).max(1440).default(60) }))
    .query(async ({ ctx, input }) => {
      const since = Date.now() - input.windowMinutes * 60_000
      const rows = await ctx.db
        .select()
        .from(trafficMetrics)
        .where(and(eq(trafficMetrics.routeId, input.routeId), gte(trafficMetrics.bucketTs, since)))
      const agg = rows.reduce(
        (a, r) => ({
          requests: a.requests + r.requests,
          bytes: a.bytes + r.bytes,
          errors: a.errors + r.errors,
          latencySumMs: a.latencySumMs + r.latencySumMs,
          status2xx: a.status2xx + r.status2xx,
          status4xx: a.status4xx + r.status4xx,
          status5xx: a.status5xx + r.status5xx,
        }),
        { requests: 0, bytes: 0, errors: 0, latencySumMs: 0, status2xx: 0, status4xx: 0, status5xx: 0 },
      )
      return {
        ...agg,
        avgLatencyMs: agg.requests > 0 ? Math.round(agg.latencySumMs / agg.requests) : 0,
        buckets: rows.map((r) => ({ t: r.bucketTs, requests: r.requests, errors: r.errors })).sort((a, b) => a.t - b.t),
      }
    }),

  topRoutes: publicProcedure
    .input(z.object({ windowMinutes: z.number().min(1).max(43200).default(1440), limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const since = Date.now() - input.windowMinutes * 60_000
      const rows = await ctx.db.select().from(trafficMetrics).where(gte(trafficMetrics.bucketTs, since))
      const byRoute = new Map<string, { requests: number; errors: number; bytes: number; latencySum: number }>()
      for (const r of rows) {
        const cur = byRoute.get(r.routeId) ?? { requests: 0, errors: 0, bytes: 0, latencySum: 0 }
        cur.requests += r.requests
        cur.errors += r.status5xx
        cur.bytes += r.bytes
        cur.latencySum += r.latencySumMs
        byRoute.set(r.routeId, cur)
      }
      const routeRows = await ctx.db.select().from(routes)
      const domainOf = new Map(routeRows.map((r) => [r.id, r.domain]))
      return Array.from(byRoute.entries())
        .map(([id, agg]) => ({
          routeId: id,
          domain: domainOf.get(id) ?? id,
          requests: agg.requests,
          errors: agg.errors,
          bytes: agg.bytes,
          avgLatencyMs: agg.requests > 0 ? Math.round(agg.latencySum / agg.requests) : 0,
        }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, input.limit)
    }),

  errors: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(accessLog).orderBy(desc(accessLog.recordedAt)).limit(input.limit * 4)
      return rows.filter((r) => (r.statusCode ?? 0) >= 500).slice(0, input.limit)
    }),

  accessLog: publicProcedure
    .input(z.object({ routeId: z.string().optional(), limit: z.number().min(1).max(500).default(100) }))
    .query(async ({ ctx, input }) => {
      const base = ctx.db.select().from(accessLog)
      const rows = input.routeId
        ? await base.where(eq(accessLog.routeId, input.routeId)).orderBy(desc(accessLog.recordedAt)).limit(input.limit)
        : await base.orderBy(desc(accessLog.recordedAt)).limit(input.limit)
      return rows
    }),

  recentRequests: publicProcedure
    .input(z.object({ routeId: z.string(), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(accessLog)
        .where(eq(accessLog.routeId, input.routeId))
      return rows
        .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
        .slice(0, input.limit)
    }),
})
