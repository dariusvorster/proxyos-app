import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { accessLog, routes, trafficMetrics, slowRequests } from '@proxyos/db'
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

  // §9.9 Bandwidth billing view
  bandwidth: publicProcedure
    .input(z.object({
      routeId: z.string().optional(),
      windowDays: z.number().int().min(1).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const since = Date.now() - input.windowDays * 86_400_000
      const base = ctx.db.select().from(trafficMetrics).where(
        input.routeId
          ? and(eq(trafficMetrics.routeId, input.routeId), gte(trafficMetrics.bucketTs, since))
          : gte(trafficMetrics.bucketTs, since)
      )
      const rows = await base
      // aggregate by day (bucket to day boundary)
      const byDay = new Map<string, { bytes: number; requests: number }>()
      for (const r of rows) {
        const day = new Date(r.bucketTs).toISOString().slice(0, 10)
        const cur = byDay.get(day) ?? { bytes: 0, requests: 0 }
        cur.bytes += r.bytes
        cur.requests += r.requests
        byDay.set(day, cur)
      }
      const byRoute = new Map<string, number>()
      for (const r of rows) {
        byRoute.set(r.routeId, (byRoute.get(r.routeId) ?? 0) + r.bytes)
      }
      const routeRows = await ctx.db.select().from(routes)
      const domainOf = new Map(routeRows.map((r) => [r.id, r.domain]))
      return {
        totalBytes: rows.reduce((s, r) => s + r.bytes, 0),
        byDay: Array.from(byDay.entries()).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
        byRoute: Array.from(byRoute.entries())
          .map(([id, bytes]) => ({ routeId: id, domain: domainOf.get(id) ?? id, bytes }))
          .sort((a, b) => b.bytes - a.bytes),
      }
    }),

  // §9.8 Slow request log
  slowRequests: publicProcedure
    .input(z.object({
      routeId: z.string().optional(),
      thresholdMs: z.number().int().min(1).default(1000),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const base = ctx.db.select().from(slowRequests)
        .orderBy(desc(slowRequests.recordedAt))
        .limit(input.limit)
      const rows = input.routeId
        ? await base.where(and(eq(slowRequests.routeId, input.routeId), gte(slowRequests.latencyMs, input.thresholdMs)))
        : await base.where(gte(slowRequests.latencyMs, input.thresholdMs))
      return rows
    }),

  // §9.7 Live heatmap — last-60s per-route counts
  liveMetrics: publicProcedure
    .query(async ({ ctx }) => {
      const since = Date.now() - 60_000
      const rows = await ctx.db.select().from(accessLog).where(gte(accessLog.recordedAt, new Date(since)))
      const byRoute = new Map<string, { requests: number; errors: number; status2xx: number; status4xx: number; status5xx: number }>()
      for (const r of rows) {
        const cur = byRoute.get(r.routeId) ?? { requests: 0, errors: 0, status2xx: 0, status4xx: 0, status5xx: 0 }
        cur.requests++
        const s = r.statusCode ?? 0
        if (s >= 500) { cur.errors++; cur.status5xx++ }
        else if (s >= 400) cur.status4xx++
        else if (s >= 200) cur.status2xx++
        byRoute.set(r.routeId, cur)
      }
      const routeRows = await ctx.db.select().from(routes)
      const domainOf = new Map(routeRows.map((r) => [r.id, r.domain]))
      return Array.from(byRoute.entries()).map(([id, agg]) => ({ routeId: id, domain: domainOf.get(id) ?? id, ...agg }))
    }),
})
