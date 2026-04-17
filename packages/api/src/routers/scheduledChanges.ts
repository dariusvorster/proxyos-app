import { TRPCError } from '@trpc/server'
import { and, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { scheduledChanges, routes, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const scheduledChangesRouter = router({
  listByRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(scheduledChanges)
        .where(eq(scheduledChanges.routeId, input.routeId))
        .orderBy(scheduledChanges.scheduledAt)
    }),

  listPending: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(scheduledChanges)
      .where(eq(scheduledChanges.status, 'pending'))
      .orderBy(scheduledChanges.scheduledAt)
  }),

  create: operatorProcedure
    .input(z.object({
      routeId: z.string(),
      action: z.enum(['enable', 'disable', 'update_upstream', 'rollback']),
      payload: z.record(z.unknown()).nullable().default(null),
      scheduledAt: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
      const now = new Date()
      const id = nanoid()
      await ctx.db.insert(scheduledChanges).values({
        id,
        routeId: input.routeId,
        action: input.action,
        payload: input.payload ? JSON.stringify(input.payload) : null,
        scheduledAt: new Date(input.scheduledAt),
        status: 'pending',
        createdAt: now,
      })
      return ctx.db.select().from(scheduledChanges).where(eq(scheduledChanges.id, id)).get()
    }),

  cancel: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(scheduledChanges).where(eq(scheduledChanges.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      if (row.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only pending changes can be cancelled' })
      await ctx.db.update(scheduledChanges).set({ status: 'cancelled' }).where(eq(scheduledChanges.id, input.id))
      return { success: true }
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(scheduledChanges).where(eq(scheduledChanges.id, input.id))
      return { success: true }
    }),
})
