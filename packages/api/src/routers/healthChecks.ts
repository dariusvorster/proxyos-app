import { TRPCError } from '@trpc/server'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { healthChecks, routes, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'
import type { Context } from '../trpc'

async function probeRoute(ctx: Context, routeId: string) {
  const route = await ctx.db.select().from(routes).where(eq(routes.id, routeId)).get()
  if (!route) throw new TRPCError({ code: 'NOT_FOUND' })

  let upstreamList: { address: string }[]
  try {
    upstreamList = JSON.parse(route.upstreams) as { address: string }[]
  } catch {
    upstreamList = []
  }
  if (upstreamList.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No upstreams configured' })

  const upstream = upstreamList[0]!
  const base = upstream.address.startsWith('http') ? upstream.address : `http://${upstream.address}`
  const path = route.healthCheckPath ?? '/'
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const timeoutMs = route.healthCheckMaxResponseMs ?? 5000

  const allowedCodes: number[] | null = route.healthCheckStatusCodes
    ? (JSON.parse(route.healthCheckStatusCodes) as number[])
    : null

  const start = Date.now()
  let statusCode: number | null = null
  let responseTimeMs: number | null = null
  let bodyMatched: boolean | null = null
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'unhealthy'
  let error: string | null = null

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'ProxyOS/HealthCheck' },
    })
    responseTimeMs = Date.now() - start
    statusCode = res.status

    const statusOk = allowedCodes ? allowedCodes.includes(statusCode) : statusCode >= 200 && statusCode < 300

    if (!statusOk) {
      overallStatus = 'unhealthy'
      error = `Unexpected status ${statusCode}`
    } else if (route.healthCheckBodyRegex) {
      const body = await res.text()
      bodyMatched = new RegExp(route.healthCheckBodyRegex).test(body)
      if (!bodyMatched) {
        overallStatus = 'degraded'
        error = `Body did not match /${route.healthCheckBodyRegex}/`
      } else {
        overallStatus = 'healthy'
      }
    } else {
      overallStatus = 'healthy'
    }

    if (overallStatus === 'healthy' && route.healthCheckMaxResponseMs && responseTimeMs > route.healthCheckMaxResponseMs) {
      overallStatus = 'degraded'
      error = `Response time ${responseTimeMs}ms exceeded limit ${route.healthCheckMaxResponseMs}ms`
    }
  } catch (e) {
    responseTimeMs = Date.now() - start
    error = (e as Error).message
    overallStatus = 'unhealthy'
  }

  const id = nanoid()
  await ctx.db.insert(healthChecks).values({
    id, routeId,
    checkedAt: new Date(),
    statusCode,
    responseTimeMs,
    bodyMatched,
    overallStatus,
    error,
  })

  return { id, overallStatus, statusCode, responseTimeMs, bodyMatched, error }
}

export const healthChecksRouter = router({
  listByRoute: publicProcedure
    .input(z.object({ routeId: z.string(), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(healthChecks)
        .where(eq(healthChecks.routeId, input.routeId))
        .orderBy(desc(healthChecks.checkedAt))
        .limit(input.limit)
    }),

  run: operatorProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return probeRoute(ctx, input.routeId)
    }),

  runAll: operatorProcedure
    .mutation(async ({ ctx }) => {
      const allRoutes = await ctx.db.select().from(routes).all()
      const enabled = allRoutes.filter(r => r.healthCheckEnabled)
      const results: { routeId: string; overallStatus: string; error: string | null }[] = []
      for (const route of enabled) {
        try {
          const r = await probeRoute(ctx, route.id)
          results.push({ routeId: route.id, overallStatus: r.overallStatus, error: r.error })
        } catch (e) {
          results.push({ routeId: route.id, overallStatus: 'unhealthy', error: (e as Error).message })
        }
      }
      return { checked: results.length, results }
    }),
})
