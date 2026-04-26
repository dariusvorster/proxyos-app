import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { routes, nanoid, auditLog } from '@proxyos/db'
import { buildCaddyRoute, validateCaddyRoute } from '@proxyos/caddy'
import { operatorProcedure, tokenScopeProcedure, router } from '../trpc'
import { rowToRoute, syncRouteToCaddy } from './routes'

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
      const caddyRoute = buildCaddyRoute(rowToRoute(updated), {})
      const validation = validateCaddyRoute(caddyRoute)
      if (!validation.valid) console.warn('[patchos] maintenance route validation errors:', validation.issues)
      await ctx.caddy.updateRoute(routeId, caddyRoute)
      await ctx.db.update(routes).set({ syncSource: 'patchos' }).where(eq(routes.id, routeId))
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
      await syncRouteToCaddy(ctx, rowToRoute(updated), 'patchos')
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
