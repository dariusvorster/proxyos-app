import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { routeSlos, sloCompliance, routes } from '@proxyos/db'
import { getSLOStatus } from '../intelligence/slo-tracker'
import { getLatencyTrend } from '../intelligence/trend-analyser'
import { publicProcedure, router } from '../trpc'

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
