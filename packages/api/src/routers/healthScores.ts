import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { routeHealthScores, routes, trafficMetrics } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'
import type { Context } from '../trpc'

const SLO_THRESHOLD = 90
const THIRTY_DAYS_S = 30 * 24 * 60 * 60

async function computeScore(ctx: Context, routeId: string) {
  const cutoff = Math.floor(Date.now() / 1000) - THIRTY_DAYS_S
  const rows = await ctx.db
    .select({
      totalRequests: sql<number>`sum(${trafficMetrics.requests})`,
      totalErrors: sql<number>`sum(${trafficMetrics.errors})`,
      totalLatencyMs: sql<number>`sum(${trafficMetrics.latencySumMs})`,
    })
    .from(trafficMetrics)
    .where(
      sql`${trafficMetrics.routeId} = ${routeId} AND ${trafficMetrics.bucketTs} >= ${cutoff}`
    )
    .get()

  const totalRequests = rows?.totalRequests ?? 0
  const totalErrors = rows?.totalErrors ?? 0
  const totalLatencyMs = rows?.totalLatencyMs ?? 0

  if (totalRequests === 0) {
    return { score: 100, uptimePct: 100, errorRatePct: 0, p95Ms: null, sloCompliant: true }
  }

  const errorRatePct = Math.round((totalErrors / totalRequests) * 100)
  const avgLatencyMs = totalLatencyMs / totalRequests
  const uptimePct = Math.max(0, 100 - errorRatePct)

  const uptimeScore = uptimePct
  const errorScore = Math.max(0, 100 - errorRatePct * 5)
  const latencyScore = Math.max(0, Math.min(100, 100 - avgLatencyMs / 50))
  const score = Math.round(uptimeScore * 0.5 + errorScore * 0.3 + latencyScore * 0.2)
  const p95Ms = Math.round(avgLatencyMs)

  return { score, uptimePct, errorRatePct, p95Ms, sloCompliant: score >= SLO_THRESHOLD }
}

export const healthScoresRouter = router({
  get: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(routeHealthScores)
        .where(eq(routeHealthScores.routeId, input.routeId))
        .get() ?? null
    }),

  listAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(routeHealthScores).orderBy(routeHealthScores.score)
  }),

  listLow: publicProcedure
    .input(z.object({ threshold: z.number().int().min(0).max(100).default(70) }))
    .query(async ({ ctx, input }) => {
      const all = await ctx.db.select().from(routeHealthScores)
      return all.filter(r => r.score < input.threshold).sort((a, b) => a.score - b.score)
    }),

  calculate: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const data = await computeScore(ctx, input.routeId)
      await ctx.db
        .insert(routeHealthScores)
        .values({ routeId: input.routeId, ...data, calculatedAt: new Date() })
        .onConflictDoUpdate({
          target: routeHealthScores.routeId,
          set: { ...data, calculatedAt: new Date() },
        })
      return data
    }),

  calculateAll: publicProcedure.mutation(async ({ ctx }) => {
    const allRoutes = await ctx.db.select({ id: routes.id }).from(routes)
    const results = await Promise.all(
      allRoutes.map(async (r) => {
        const data = await computeScore(ctx, r.id)
        await ctx.db
          .insert(routeHealthScores)
          .values({ routeId: r.id, ...data, calculatedAt: new Date() })
          .onConflictDoUpdate({
            target: routeHealthScores.routeId,
            set: { ...data, calculatedAt: new Date() },
          })
        return { routeId: r.id, ...data }
      })
    )
    return results
  }),
})
