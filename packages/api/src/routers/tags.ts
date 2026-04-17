import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { routeTags, routes, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const tagsRouter = router({
  listByRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(routeTags).where(eq(routeTags.routeId, input.routeId))
      return rows.map(r => r.tag)
    }),

  listAll: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .selectDistinct({ tag: routeTags.tag })
      .from(routeTags)
      .orderBy(routeTags.tag)
    return rows.map(r => r.tag)
  }),

  add: operatorProcedure
    .input(z.object({ routeId: z.string(), tag: z.string().min(1).max(50).regex(/^[a-z0-9_:-]+$/i) }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.insert(routeTags).values({ id: nanoid(), routeId: input.routeId, tag: input.tag }).onConflictDoNothing()
      return { success: true }
    }),

  remove: operatorProcedure
    .input(z.object({ routeId: z.string(), tag: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(routeTags)
        .where(and(eq(routeTags.routeId, input.routeId), eq(routeTags.tag, input.tag)))
      return { success: true }
    }),

  setTags: operatorProcedure
    .input(z.object({ routeId: z.string(), tags: z.array(z.string().min(1).max(50)) }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.delete(routeTags).where(eq(routeTags.routeId, input.routeId))
      if (input.tags.length > 0) {
        await ctx.db.insert(routeTags).values(
          input.tags.map(tag => ({ id: nanoid(), routeId: input.routeId, tag }))
        )
      }
      return { success: true }
    }),

  listRoutesByTag: publicProcedure
    .input(z.object({ tag: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select({ routeId: routeTags.routeId }).from(routeTags).where(eq(routeTags.tag, input.tag))
      return rows.map(r => r.routeId)
    }),

  bulkAddTag: operatorProcedure
    .input(z.object({ routeIds: z.array(z.string()), tag: z.string().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      for (const routeId of input.routeIds) {
        await ctx.db.insert(routeTags).values({ id: nanoid(), routeId, tag: input.tag }).onConflictDoNothing()
      }
      return { success: true, count: input.routeIds.length }
    }),
})
