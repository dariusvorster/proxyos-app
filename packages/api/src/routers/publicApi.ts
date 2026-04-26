import { TRPCError } from '@trpc/server'
import { eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { routes, certificates, trafficMetrics, nanoid } from '@proxyos/db'
import { tokenScopeProcedure, router } from '../trpc'
import { rowToRoute, syncRouteToCaddy } from './routes'

const PKG_VERSION = '0.2.0'

const writeUpstreamSchema = z.object({
  address: z.string().min(1),
  weight: z.number().int().min(0).max(100).default(1),
})

export const publicApiRouter = router({

  /** health:read — instance liveness + counts */
  health: tokenScopeProcedure('health:read').query(async ({ ctx }) => {
    const routeCount = (await ctx.db.select({ n: sql<number>`count(*)` }).from(routes).get())?.n ?? 0
    const certCount = (await ctx.db.select({ n: sql<number>`count(*)` }).from(certificates).get())?.n ?? 0
    return { ok: true, version: PKG_VERSION, routeCount, certCount }
  }),

  /** routes:read — full route list (no credentials) */
  routes: tokenScopeProcedure('routes:read').query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(routes).all()
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      domain: r.domain,
      enabled: r.enabled,
      upstreams: (JSON.parse(r.upstreams) as Array<{ address: string; weight?: number }>).map(u => ({
        address: u.address,
        weight: u.weight ?? 1,
      })),
      lbPolicy: r.lbPolicy,
      tlsMode: r.tlsMode,
      ssoEnabled: r.ssoEnabled,
      compressionEnabled: r.compressionEnabled,
      websocketEnabled: r.websocketEnabled,
      http3Enabled: r.http3Enabled,
      healthCheckEnabled: r.healthCheckEnabled,
      healthCheckPath: r.healthCheckPath,
      healthCheckInterval: r.healthCheckInterval,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  }),

  /** routes:write — create a route */
  createRoute: tokenScopeProcedure('routes:write')
    .input(z.object({
      name: z.string().min(1).max(100),
      domain: z.string().min(1).max(253),
      upstreams: z.array(writeUpstreamSchema).min(1),
      tlsMode: z.enum(['auto', 'auto-staging', 'internal', 'off']).default('auto'),
      compressionEnabled: z.boolean().default(true),
      healthCheckEnabled: z.boolean().default(true),
      healthCheckPath: z.string().default('/'),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(routes).where(eq(routes.domain, input.domain)).get()
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: `Route for ${input.domain} already exists` })

      const now = new Date()
      const id = nanoid()
      await ctx.db.insert(routes).values({
        id,
        name: input.name,
        domain: input.domain,
        upstreams: JSON.stringify(input.upstreams),
        upstreamType: 'http',
        lbPolicy: 'round_robin',
        tlsMode: input.tlsMode,
        compressionEnabled: input.compressionEnabled,
        healthCheckEnabled: input.healthCheckEnabled,
        healthCheckPath: input.healthCheckPath,
        healthCheckInterval: 30,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      } as typeof routes.$inferInsert)

      const row = await ctx.db.select().from(routes).where(eq(routes.id, id)).get()
      if (row) void syncRouteToCaddy(ctx, rowToRoute(row), 'public-api').catch(() => {})
      return { id }
    }),

  /** routes:write — update a route (enabled, upstreams, name) */
  updateRoute: tokenScopeProcedure('routes:write')
    .input(z.object({
      id: z.string(),
      patch: z.object({
        name: z.string().min(1).max(100).optional(),
        enabled: z.boolean().optional(),
        upstreams: z.array(writeUpstreamSchema).min(1).optional(),
        healthCheckEnabled: z.boolean().optional(),
        healthCheckPath: z.string().optional(),
        compressionEnabled: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const set: Record<string, unknown> = { updatedAt: new Date() }
      const p = input.patch
      if (p.name !== undefined) set.name = p.name
      if (p.enabled !== undefined) set.enabled = p.enabled
      if (p.upstreams !== undefined) set.upstreams = JSON.stringify(p.upstreams)
      if (p.healthCheckEnabled !== undefined) set.healthCheckEnabled = p.healthCheckEnabled
      if (p.healthCheckPath !== undefined) set.healthCheckPath = p.healthCheckPath
      if (p.compressionEnabled !== undefined) set.compressionEnabled = p.compressionEnabled

      await ctx.db.update(routes).set(set).where(eq(routes.id, input.id))
      const updated = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (updated) void syncRouteToCaddy(ctx, rowToRoute(updated), 'public-api').catch(() => {})
      return { ok: true }
    }),

  /** routes:write — delete a route */
  deleteRoute: tokenScopeProcedure('routes:write')
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.delete(routes).where(eq(routes.id, input.id))
      await ctx.caddy.removeRoute(input.id).catch(() => {})
      return { ok: true }
    }),

  /** certs:read — certificate list with expiry */
  certs: tokenScopeProcedure('certs:read').query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(certificates).all()
    return rows.map(r => ({
      id: r.id,
      domain: r.domain,
      status: r.status,
      source: r.source,
      issuedAt: r.issuedAt,
      expiresAt: r.expiresAt,
      autoRenew: r.autoRenew,
      routeId: r.routeId,
    }))
  }),

  /** analytics:read — per-route traffic summary for a rolling window */
  analytics: tokenScopeProcedure('analytics:read')
    .input(z.object({ windowMinutes: z.number().min(1).max(1440).default(60) }))
    .query(async ({ ctx, input }) => {
      const since = Date.now() - input.windowMinutes * 60_000
      const rows = await ctx.db.select().from(trafficMetrics)
        .where(gte(trafficMetrics.bucketTs, since))
        .all()

      const byRoute = new Map<string, { requests: number; errors: number; latencySum: number; status5xx: number }>()
      for (const row of rows) {
        const cur = byRoute.get(row.routeId) ?? { requests: 0, errors: 0, latencySum: 0, status5xx: 0 }
        cur.requests += row.requests
        cur.errors += row.errors
        cur.latencySum += row.latencySumMs
        cur.status5xx += row.status5xx
        byRoute.set(row.routeId, cur)
      }

      return Array.from(byRoute.entries()).map(([routeId, d]) => ({
        routeId,
        requests: d.requests,
        errors: d.errors,
        status5xx: d.status5xx,
        avgLatencyMs: d.requests > 0 ? Math.round(d.latencySum / d.requests) : 0,
        errorRatePct: d.requests > 0 ? parseFloat(((d.errors / d.requests) * 100).toFixed(2)) : 0,
      }))
    }),
})
