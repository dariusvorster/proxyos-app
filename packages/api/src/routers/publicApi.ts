import { gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { routes, certificates, trafficMetrics } from '@proxyos/db'
import { tokenScopeProcedure, router } from '../trpc'

const PKG_VERSION = '0.2.0'

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
