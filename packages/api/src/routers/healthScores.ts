import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { routeHealthScores, routes } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

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
})
