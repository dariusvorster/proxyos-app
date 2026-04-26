import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { routeRules, routes, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'
import { rowToRoute, syncRouteToCaddy } from './routes'

const ruleInput = z.object({
  priority: z.number().int().default(0),
  matcherType: z.enum(['path', 'header', 'query', 'method']),
  matcherKey: z.string().nullable().default(null),
  matcherValue: z.string().min(1),
  action: z.enum(['upstream', 'redirect', 'static']),
  upstream: z.string().nullable().default(null),
  redirectUrl: z.string().nullable().default(null),
  staticBody: z.string().nullable().default(null),
  staticStatus: z.number().int().nullable().default(null),
  enabled: z.boolean().default(true),
})

export const routeRulesRouter = router({
  listByRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(routeRules)
        .where(eq(routeRules.routeId, input.routeId))
        .orderBy(routeRules.priority)
    }),

  create: operatorProcedure
    .input(z.object({ routeId: z.string() }).merge(ruleInput))
    .mutation(async ({ ctx, input }) => {
      const routeRow = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!routeRow) throw new TRPCError({ code: 'NOT_FOUND' })
      const id = nanoid()
      await ctx.db.insert(routeRules).values({
        id,
        routeId: input.routeId,
        priority: input.priority,
        matcherType: input.matcherType,
        matcherKey: input.matcherKey,
        matcherValue: input.matcherValue,
        action: input.action,
        upstream: input.upstream,
        redirectUrl: input.redirectUrl,
        staticBody: input.staticBody,
        staticStatus: input.staticStatus,
        enabled: input.enabled ? 1 : 0,
        createdAt: new Date(),
      })
      await syncRouteToCaddy(ctx, rowToRoute(routeRow), 'route-rules')
      return ctx.db.select().from(routeRules).where(eq(routeRules.id, id)).get()
    }),

  update: operatorProcedure
    .input(z.object({ id: z.string(), patch: ruleInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.db.select().from(routeRules).where(eq(routeRules.id, input.id)).get()
      if (!rule) throw new TRPCError({ code: 'NOT_FOUND' })
      const { enabled, ...rest } = input.patch
      const patch: Record<string, unknown> = { ...rest }
      if (enabled !== undefined) patch.enabled = enabled ? 1 : 0
      await ctx.db.update(routeRules).set(patch).where(eq(routeRules.id, input.id))
      const routeRow = await ctx.db.select().from(routes).where(eq(routes.id, rule.routeId)).get()
      if (routeRow) await syncRouteToCaddy(ctx, rowToRoute(routeRow), 'route-rules')
      return ctx.db.select().from(routeRules).where(eq(routeRules.id, input.id)).get()
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.db.select().from(routeRules).where(eq(routeRules.id, input.id)).get()
      if (!rule) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.delete(routeRules).where(eq(routeRules.id, input.id))
      const routeRow = await ctx.db.select().from(routes).where(eq(routes.id, rule.routeId)).get()
      if (routeRow) await syncRouteToCaddy(ctx, rowToRoute(routeRow), 'route-rules')
      return { success: true }
    }),
})
