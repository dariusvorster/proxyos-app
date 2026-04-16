import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { monitors, connections, routes, nanoid, type MonitorRow } from '@proxyos/db'
import { adapterRegistry } from '@proxyos/connect'
import { UptimeKumaAdapter, BetterstackAdapter, FreshpingAdapter } from '@proxyos/connect/monitoring'
import { publicProcedure, router } from '../trpc'

export const monitorsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(monitors).all()
    const routeIds = [...new Set(rows.map(m => m.routeId))]
    const routeRows = routeIds.length
      ? await ctx.db.select({ id: routes.id, domain: routes.domain }).from(routes).all()
      : []
    const routeMap = Object.fromEntries(routeRows.map(r => [r.id, r.domain]))
    return rows.map((m: MonitorRow) => ({ ...m, domain: routeMap[m.routeId] ?? m.routeId }))
  }),

  listForRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(monitors).where(eq(monitors.routeId, input.routeId)).all()
    }),

  createForRoute: publicProcedure
    .input(z.object({
      routeId: z.string(),
      connectionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND', message: 'Route not found' })

      const conn = await ctx.db.select().from(connections).where(eq(connections.id, input.connectionId)).get()
      if (!conn) throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found' })

      const adapter = adapterRegistry.get(input.connectionId)
      if (!adapter) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Adapter not loaded' })

      const url = `https://${route.domain}`
      let monitorProviderId: string

      switch (adapter.type) {
        case 'uptime_kuma': {
          const id = await (adapter as UptimeKumaAdapter).createMonitor(route.domain, url)
          monitorProviderId = String(id)
          break
        }
        case 'betterstack': {
          monitorProviderId = await (adapter as BetterstackAdapter).createMonitor(route.domain, url)
          break
        }
        case 'freshping': {
          const id = await (adapter as FreshpingAdapter).createCheck(route.domain, url)
          monitorProviderId = String(id)
          break
        }
        default:
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Adapter type ${adapter.type} does not support monitoring` })
      }

      const id = nanoid()
      await ctx.db.insert(monitors).values({
        id: monitorProviderId,
        connectionId: input.connectionId,
        routeId: input.routeId,
        url,
        status: 'pending',
        lastCheck: null,
        providerUrl: null,
      })

      return { ok: true, monitorId: monitorProviderId, id }
    }),

  pauseForRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const monitorRows = await ctx.db.select().from(monitors).where(eq(monitors.routeId, input.routeId)).all()
      for (const m of monitorRows) {
        const adapter = adapterRegistry.get(m.connectionId)
        if (!adapter) continue
        try {
          if (adapter.type === 'uptime_kuma') await (adapter as UptimeKumaAdapter).pauseMonitor(Number(m.id))
          if (adapter.type === 'betterstack') await (adapter as BetterstackAdapter).pauseMonitor(m.id)
          if (adapter.type === 'freshping') await (adapter as FreshpingAdapter).pauseCheck(Number(m.id))
        } catch { /* best-effort */ }
      }
      return { ok: true }
    }),

  deleteForRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const monitorRows = await ctx.db.select().from(monitors).where(eq(monitors.routeId, input.routeId)).all()
      for (const m of monitorRows) {
        const adapter = adapterRegistry.get(m.connectionId)
        if (adapter) {
          try {
            if (adapter.type === 'uptime_kuma') await (adapter as UptimeKumaAdapter).deleteMonitor(Number(m.id))
            if (adapter.type === 'betterstack') await (adapter as BetterstackAdapter).deleteMonitor(m.id)
            if (adapter.type === 'freshping') await (adapter as FreshpingAdapter).deleteCheck(Number(m.id))
          } catch { /* best-effort */ }
        }
        await ctx.db.delete(monitors).where(eq(monitors.id, m.id))
      }
      return { ok: true }
    }),
})
