import { TRPCError } from '@trpc/server'
import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'
import { routeSlos, sloCompliance, routes, routeRules, nanoid } from '@proxyos/db'
import { getSLOStatus } from '../intelligence/slo-tracker'
import { getLatencyTrend } from '../intelligence/trend-analyser'
import { publicProcedure, operatorProcedure, router } from '../trpc'
import { rowToRoute, syncRouteToCaddy } from './routes'

export const intelligenceRouter = router({
  // ── SLO ───────────────────────────────────────────────────────────────────

  getSLO: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(routeSlos).where(eq(routeSlos.routeId, input.routeId)).get() ?? null
    }),

  setSLO: publicProcedure
    .input(z.object({
      routeId: z.string(),
      p95TargetMs: z.number().int().min(1),
      p99TargetMs: z.number().int().min(1).optional(),
      windowDays: z.number().int().min(1).max(365).default(30),
      alertOnBreach: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.insert(routeSlos).values({
        routeId: input.routeId,
        p95TargetMs: input.p95TargetMs,
        p99TargetMs: input.p99TargetMs ?? null,
        windowDays: input.windowDays,
        alertOnBreach: input.alertOnBreach ? 1 : 0,
      }).onConflictDoUpdate({
        target: routeSlos.routeId,
        set: {
          p95TargetMs: input.p95TargetMs,
          p99TargetMs: input.p99TargetMs ?? null,
          windowDays: input.windowDays,
          alertOnBreach: input.alertOnBreach ? 1 : 0,
        },
      })
      return { ok: true }
    }),

  deleteSLO: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(routeSlos).where(eq(routeSlos.routeId, input.routeId))
      return { ok: true }
    }),

  getSLOStatus: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getSLOStatus(ctx.db, input.routeId)
    }),

  getSLOHistory: publicProcedure
    .input(z.object({ routeId: z.string(), limit: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(sloCompliance)
        .where(eq(sloCompliance.routeId, input.routeId))
        .limit(input.limit)
        .all()
    }),

  // ── Trend analysis ────────────────────────────────────────────────────────

  getLatencyTrend: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getLatencyTrend(ctx.db, input.routeId)
    }),

  // ── A/B traffic splitting ─────────────────────────────────────────────────

  getTrafficSplit: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) return null
      try {
        const upstreams = JSON.parse(route.upstreams) as { address: string; weight?: number; label?: string }[]
        return { upstreams: upstreams.map((u, i) => ({ ...u, weight: u.weight ?? 100, label: u.label ?? `upstream-${i + 1}` })) }
      } catch { return null }
    }),

  // ── Smart routing rules (§9.5) ────────────────────────────────────────────

  listRouteRules: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(routeRules)
        .where(eq(routeRules.routeId, input.routeId))
        .orderBy(asc(routeRules.priority))
        .all()
    }),

  createRouteRule: operatorProcedure
    .input(z.object({
      routeId: z.string(),
      matcherType: z.enum(['path', 'header', 'query', 'method']),
      matcherKey: z.string().optional(),
      matcherValue: z.string().min(1),
      action: z.enum(['upstream', 'redirect', 'static']),
      upstream: z.string().optional(),
      redirectUrl: z.string().optional(),
      staticBody: z.string().optional(),
      staticStatus: z.number().int().optional(),
      priority: z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
      const id = nanoid()
      await ctx.db.insert(routeRules).values({
        id,
        routeId: input.routeId,
        priority: input.priority,
        matcherType: input.matcherType,
        matcherKey: input.matcherKey ?? null,
        matcherValue: input.matcherValue,
        action: input.action,
        upstream: input.upstream ?? null,
        redirectUrl: input.redirectUrl ?? null,
        staticBody: input.staticBody ?? null,
        staticStatus: input.staticStatus ?? null,
        enabled: 1,
        createdAt: new Date(),
      })
      void syncRouteToCaddy(ctx, rowToRoute(route)).catch(() => {})
      return { id }
    }),

  updateRouteRule: operatorProcedure
    .input(z.object({
      id: z.string(),
      enabled: z.boolean().optional(),
      priority: z.number().int().optional(),
      matcherValue: z.string().optional(),
      action: z.enum(['upstream', 'redirect', 'static']).optional(),
      upstream: z.string().nullable().optional(),
      redirectUrl: z.string().nullable().optional(),
      staticBody: z.string().nullable().optional(),
      staticStatus: z.number().int().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      const set: Record<string, unknown> = {}
      if (patch.enabled !== undefined) set.enabled = patch.enabled ? 1 : 0
      if (patch.priority !== undefined) set.priority = patch.priority
      if (patch.matcherValue !== undefined) set.matcherValue = patch.matcherValue
      if (patch.action !== undefined) set.action = patch.action
      if ('upstream' in patch) set.upstream = patch.upstream
      if ('redirectUrl' in patch) set.redirectUrl = patch.redirectUrl
      if ('staticBody' in patch) set.staticBody = patch.staticBody
      if ('staticStatus' in patch) set.staticStatus = patch.staticStatus
      await ctx.db.update(routeRules).set(set).where(eq(routeRules.id, id))
      const rule = await ctx.db.select().from(routeRules).where(eq(routeRules.id, id)).get()
      if (rule) {
        const routeRow = await ctx.db.select().from(routes).where(eq(routes.id, rule.routeId)).get()
        if (routeRow) void syncRouteToCaddy(ctx, rowToRoute(routeRow)).catch(() => {})
      }
      return { ok: true }
    }),

  deleteRouteRule: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.db.select().from(routeRules).where(eq(routeRules.id, input.id)).get()
      await ctx.db.delete(routeRules).where(eq(routeRules.id, input.id))
      if (rule) {
        const routeRow = await ctx.db.select().from(routes).where(eq(routes.id, rule.routeId)).get()
        if (routeRow) void syncRouteToCaddy(ctx, rowToRoute(routeRow)).catch(() => {})
      }
      return { ok: true }
    }),

  setTrafficSplit: publicProcedure
    .input(z.object({
      routeId: z.string(),
      upstreams: z.array(z.object({
        address: z.string(),
        weight: z.number().int().min(0).max(100),
        label: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.update(routes)
        .set({ upstreams: JSON.stringify(input.upstreams) })
        .where(eq(routes.id, input.routeId))
      return { ok: true }
    }),
})
