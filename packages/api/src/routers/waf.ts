import { desc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { wafEvents, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const wafRouter = router({
  listEvents: publicProcedure
    .input(z.object({
      routeId: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
      since: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      let q = ctx.db.select().from(wafEvents).$dynamic()
      if (input.routeId) q = q.where(eq(wafEvents.routeId, input.routeId))
      if (input.since) q = q.where(gte(wafEvents.detectedAt, input.since))
      const rows = await q.orderBy(desc(wafEvents.detectedAt)).limit(input.limit)
      return rows
    }),

  clearEvents: operatorProcedure
    .input(z.object({ routeId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.routeId) {
        await ctx.db.delete(wafEvents).where(eq(wafEvents.routeId, input.routeId))
      } else {
        await ctx.db.delete(wafEvents)
      }
      return { success: true }
    }),

  ingestEvent: operatorProcedure
    .input(z.object({
      routeId: z.string(),
      ruleId: z.string().optional(),
      action: z.enum(['detected', 'blocked']),
      clientIp: z.string().optional(),
      path: z.string().optional(),
      message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(wafEvents).values({
        id: nanoid(),
        routeId: input.routeId,
        ruleId: input.ruleId ?? null,
        action: input.action,
        clientIp: input.clientIp ?? null,
        path: input.path ?? null,
        message: input.message ?? null,
        detectedAt: new Date(),
      })
      return { success: true }
    }),
})
