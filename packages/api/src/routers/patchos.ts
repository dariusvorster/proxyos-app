import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { routes, nanoid, auditLog } from '@proxyos/db'
import { buildCaddyRoute } from '@proxyos/caddy'
import { operatorProcedure, tokenScopeProcedure, router } from '../trpc'

async function doSetMaintenance(
  ctx: { db: ReturnType<typeof import('@proxyos/db').getDb>; caddy: import('@proxyos/caddy').CaddyClient },
  routeId: string,
  maintenanceUrl: string,
): Promise<void> {
  const row = await ctx.db.select().from(routes).where(eq(routes.id, routeId)).get()
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

  const maintenanceUpstream = maintenanceUrl.replace(/^https?:\/\//, '')
  await ctx.db.update(routes).set({
    maintenanceMode: true,
    maintenanceSavedUpstreams: row.upstreams,
    upstreams: JSON.stringify([{ address: maintenanceUpstream }]),
    updatedAt: new Date(),
  } as Record<string, unknown>).where(eq(routes.id, routeId))

  const updated = await ctx.db.select().from(routes).where(eq(routes.id, routeId)).get()
  if (updated) {
    try {
      await ctx.caddy.updateRoute(routeId, buildCaddyRoute({
        id: updated.id, name: updated.name, domain: updated.domain, enabled: updated.enabled,
        upstreamType: updated.upstreamType as 'http',
        upstreams: JSON.parse(updated.upstreams),
        lbPolicy: (updated.lbPolicy ?? 'round_robin') as 'round_robin',
        tlsMode: updated.tlsMode as 'auto',
        ssoEnabled: false, ssoProviderId: null, tlsDnsProviderId: null,
        healthCheckEnabled: false, healthCheckPath: '/', healthCheckInterval: 30,
        compressionEnabled: false, websocketEnabled: false, http2Enabled: true, http3Enabled: false,
        wafMode: 'off' as const, createdAt: updated.createdAt, updatedAt: updated.updatedAt,
        origin: (updated.origin as 'central' | 'local') ?? 'central',
        scope: (updated.scope as 'exclusive' | 'local_only') ?? 'exclusive',
      }, {}))
    } catch { /* Caddy sync failure is non-fatal — maintenance flag is set in DB */ }
  }
}

async function doRestore(
  ctx: { db: ReturnType<typeof import('@proxyos/db').getDb>; caddy: import('@proxyos/caddy').CaddyClient },
  routeId: string,
): Promise<void> {
  const row = await ctx.db.select().from(routes).where(eq(routes.id, routeId)).get()
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

  const savedUpstreams = (row as Record<string, unknown>).maintenanceSavedUpstreams as string | null
  if (!savedUpstreams) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No saved upstreams to restore' })

  await ctx.db.update(routes).set({
    maintenanceMode: false,
    upstreams: savedUpstreams,
    maintenanceSavedUpstreams: null,
    updatedAt: new Date(),
  } as Record<string, unknown>).where(eq(routes.id, routeId))

  const updated = await ctx.db.select().from(routes).where(eq(routes.id, routeId)).get()
  if (updated) {
    try {
      await ctx.caddy.updateRoute(routeId, buildCaddyRoute({
        id: updated.id, name: updated.name, domain: updated.domain, enabled: updated.enabled,
        upstreamType: updated.upstreamType as 'http',
        upstreams: JSON.parse(updated.upstreams),
        lbPolicy: (updated.lbPolicy ?? 'round_robin') as 'round_robin',
        tlsMode: updated.tlsMode as 'auto',
        ssoEnabled: updated.ssoEnabled, ssoProviderId: updated.ssoProviderId, tlsDnsProviderId: updated.tlsDnsProviderId,
        healthCheckEnabled: updated.healthCheckEnabled, healthCheckPath: updated.healthCheckPath, healthCheckInterval: updated.healthCheckInterval,
        compressionEnabled: updated.compressionEnabled, websocketEnabled: updated.websocketEnabled, http2Enabled: updated.http2Enabled, http3Enabled: updated.http3Enabled,
        wafMode: (updated.wafMode ?? 'off') as 'off',
        createdAt: updated.createdAt, updatedAt: updated.updatedAt,
        origin: (updated.origin as 'central' | 'local') ?? 'central',
        scope: (updated.scope as 'exclusive' | 'local_only') ?? 'exclusive',
      }, {}))
    } catch { /* non-fatal */ }
  }
}

export const patchosRouter = router({
  getStatus: operatorProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const r = row as Record<string, unknown>
      return {
        maintenanceMode: Boolean(r.maintenanceMode),
        hasSavedUpstreams: Boolean(r.maintenanceSavedUpstreams),
      }
    }),

  setMaintenance: operatorProcedure
    .input(z.object({ routeId: z.string(), maintenanceUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      await doSetMaintenance(ctx, input.routeId, input.maintenanceUrl)
      await ctx.db.insert(auditLog).values({
        id: nanoid(), action: 'route.maintenance_on', resourceType: 'route',
        resourceId: input.routeId, actor: 'user',
        detail: JSON.stringify({ maintenanceUrl: input.maintenanceUrl }),
        createdAt: new Date(),
      })
      return { ok: true }
    }),

  restore: operatorProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await doRestore(ctx, input.routeId)
      await ctx.db.insert(auditLog).values({
        id: nanoid(), action: 'route.maintenance_off', resourceType: 'route',
        resourceId: input.routeId, actor: 'user',
        createdAt: new Date(),
      })
      return { ok: true }
    }),

  // Same as above but authenticated via API token (for PatchOS to call)
  setMaintenanceExternal: tokenScopeProcedure('routes:write')
    .input(z.object({ routeId: z.string(), maintenanceUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      await doSetMaintenance(ctx, input.routeId, input.maintenanceUrl)
      await ctx.db.insert(auditLog).values({
        id: nanoid(), action: 'route.maintenance_on', resourceType: 'route',
        resourceId: input.routeId, actor: 'patchos',
        detail: JSON.stringify({ maintenanceUrl: input.maintenanceUrl }),
        createdAt: new Date(),
      })
      return { ok: true }
    }),

  restoreExternal: tokenScopeProcedure('routes:write')
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await doRestore(ctx, input.routeId)
      await ctx.db.insert(auditLog).values({
        id: nanoid(), action: 'route.maintenance_off', resourceType: 'route',
        resourceId: input.routeId, actor: 'patchos',
        createdAt: new Date(),
      })
      return { ok: true }
    }),
})
