import { TRPCError } from '@trpc/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { trafficReplayLogs, routes, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const trafficReplayRouter = router({
  listByRoute: publicProcedure
    .input(z.object({
      routeId: z.string(),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(trafficReplayLogs)
        .where(eq(trafficReplayLogs.routeId, input.routeId))
        .orderBy(trafficReplayLogs.recordedAt)
        .limit(input.limit)
    }),

  record: operatorProcedure
    .input(z.object({
      routeId: z.string(),
      method: z.string(),
      path: z.string(),
      query: z.string().nullable().default(null),
      headers: z.record(z.string()).nullable().default(null),
      body: z.string().nullable().default(null),
      statusCode: z.number().int().nullable().default(null),
      responseTimeMs: z.number().int().nullable().default(null),
    }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.insert(trafficReplayLogs).values({
        id: nanoid(),
        routeId: input.routeId,
        method: input.method,
        path: input.path,
        query: input.query,
        headers: input.headers ? JSON.stringify(input.headers) : null,
        body: input.body,
        statusCode: input.statusCode,
        responseTimeMs: input.responseTimeMs,
        recordedAt: new Date(),
      })
      return { success: true }
    }),

  replay: operatorProcedure
    .input(z.object({
      id: z.string(),
      targetUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const log = await ctx.db.select().from(trafficReplayLogs).where(eq(trafficReplayLogs.id, input.id)).get()
      if (!log) throw new TRPCError({ code: 'NOT_FOUND' })
      const headers = log.headers ? JSON.parse(log.headers) as Record<string, string> : {}
      // Strip hop-by-hop headers
      delete headers.host
      delete headers.connection
      delete headers['transfer-encoding']
      const url = `${input.targetUrl}${log.path}${log.query ? `?${log.query}` : ''}`
      const start = Date.now()
      try {
        const res = await fetch(url, {
          method: log.method,
          headers,
          body: log.body ?? undefined,
          signal: AbortSignal.timeout(10000),
        })
        return {
          statusCode: res.status,
          responseTimeMs: Date.now() - start,
          ok: res.ok,
        }
      } catch (e) {
        return {
          statusCode: null,
          responseTimeMs: Date.now() - start,
          ok: false,
          error: (e as Error).message,
        }
      }
    }),

  clear: operatorProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(trafficReplayLogs).where(eq(trafficReplayLogs.routeId, input.routeId))
      return { success: true }
    }),

  exportNdjson: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(trafficReplayLogs)
        .where(eq(trafficReplayLogs.routeId, input.routeId))
        .orderBy(trafficReplayLogs.recordedAt)
        .limit(1000)
      return rows.map(r => JSON.stringify({
        method: r.method,
        path: r.path,
        query: r.query,
        headers: r.headers ? JSON.parse(r.headers) : {},
        body: r.body,
        recordedAt: r.recordedAt,
      })).join('\n')
    }),
})
