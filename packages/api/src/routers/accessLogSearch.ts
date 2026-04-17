import { and, desc, eq, gte, like, lte } from 'drizzle-orm'
import { z } from 'zod'
import { accessLog } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

export const accessLogSearchRouter = router({
  search: publicProcedure
    .input(z.object({
      routeId: z.string().optional(),
      query: z.string().optional(),
      statusCode: z.number().int().optional(),
      method: z.string().optional(),
      clientIp: z.string().optional(),
      dateFrom: z.string().optional(), // ISO date string
      dateTo: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = []

      if (input.routeId) conditions.push(eq(accessLog.routeId, input.routeId))
      if (input.statusCode) conditions.push(eq(accessLog.statusCode, input.statusCode))
      if (input.method) conditions.push(eq(accessLog.method, input.method.toUpperCase()))
      if (input.clientIp) conditions.push(like(accessLog.clientIp, `%${input.clientIp}%`))
      if (input.query) conditions.push(like(accessLog.path, `%${input.query}%`))
      if (input.dateFrom) {
        const ts = new Date(input.dateFrom).getTime()
        if (!isNaN(ts)) conditions.push(gte(accessLog.recordedAt, new Date(ts)))
      }
      if (input.dateTo) {
        const ts = new Date(input.dateTo).getTime() + 86_400_000
        if (!isNaN(ts)) conditions.push(lte(accessLog.recordedAt, new Date(ts)))
      }

      const rows = await ctx.db
        .select()
        .from(accessLog)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(accessLog.recordedAt))
        .limit(input.limit)
        .offset(input.offset)

      return rows
    }),

  quickFilters: publicProcedure
    .input(z.object({ routeId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since24h = new Date(Date.now() - 86_400_000)
      const conditions = [gte(accessLog.recordedAt, since24h)]
      if (input.routeId) conditions.push(eq(accessLog.routeId, input.routeId))

      const rows = await ctx.db
        .select()
        .from(accessLog)
        .where(and(...conditions))

      const byIp = new Map<string, number>()
      let slowest100: typeof rows = []
      const fivexx = rows.filter(r => (r.statusCode ?? 0) >= 500)

      for (const r of rows) {
        if (r.clientIp) byIp.set(r.clientIp, (byIp.get(r.clientIp) ?? 0) + 1)
      }

      slowest100 = [...rows]
        .filter(r => r.latencyMs != null)
        .sort((a, b) => (b.latencyMs ?? 0) - (a.latencyMs ?? 0))
        .slice(0, 100)

      const topIps = [...byIp.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count }))

      return { fivexx: fivexx.slice(0, 100), slowest: slowest100, topIps }
    }),
})
