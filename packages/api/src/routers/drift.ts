import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { driftEvents, nanoid, routes } from '@proxyos/db'
import { buildCaddyRoute } from '@proxyos/caddy'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const driftRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(driftEvents)
      .where(isNull(driftEvents.resolvedAt))
      .orderBy(desc(driftEvents.detectedAt))
      .limit(50)
    return rows
  }),

  listAll: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(driftEvents)
        .orderBy(desc(driftEvents.detectedAt))
        .limit(input.limit)
      return rows
    }),

  reconcile: operatorProcedure
    .input(z.object({
      eventId: z.string(),
      action: z.enum(['db_to_caddy', 'mark_resolved']),
    }))
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.select().from(driftEvents).where(eq(driftEvents.id, input.eventId)).get()
      if (!event) return { success: false }

      if (input.action === 'db_to_caddy' && event.routeId) {
        const row = await ctx.db.select().from(routes).where(eq(routes.id, event.routeId)).get()
        if (row) {
          const route = {
            id: row.id,
            name: row.name,
            domain: row.domain,
            enabled: row.enabled,
            upstreamType: row.upstreamType as 'http',
            upstreams: JSON.parse(row.upstreams) as Array<{ address: string }>,
            tlsMode: row.tlsMode as 'auto' | 'dns' | 'internal' | 'custom' | 'off',
            tlsDnsProviderId: row.tlsDnsProviderId,
            ssoEnabled: row.ssoEnabled,
            ssoProviderId: row.ssoProviderId,
            rateLimit: null,
            ipAllowlist: null,
            basicAuth: null,
            headers: null,
            lbPolicy: (row.lbPolicy ?? 'round_robin') as 'round_robin',
            healthCheckEnabled: row.healthCheckEnabled,
            healthCheckPath: row.healthCheckPath,
            healthCheckInterval: row.healthCheckInterval,
            compressionEnabled: row.compressionEnabled,
            websocketEnabled: row.websocketEnabled,
            http2Enabled: row.http2Enabled,
            http3Enabled: row.http3Enabled,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
          try {
            await ctx.caddy.updateRoute(row.id, buildCaddyRoute(route))
          } catch {
            await ctx.caddy.addRoute(buildCaddyRoute(route))
          }
        }
      }

      await ctx.db.update(driftEvents)
        .set({ resolvedAt: new Date(), resolution: input.action })
        .where(eq(driftEvents.id, input.eventId))

      return { success: true }
    }),
})
