import { TRPCError } from '@trpc/server'
import { eq, desc, and } from 'drizzle-orm'
import { z } from 'zod'
import { tunnelProviders, tunnelRoutes, tunnelEvents, routes, nanoid } from '@proxyos/db'
import { CaddyClient } from '@proxyos/caddy'
import type { CaddyRoute } from '@proxyos/caddy'
import {
  tunnelManager,
  CloudflareTunnelProvider,
  TailscaleFunnelProvider,
  NgrokProvider,
  TUNNEL_PORTS,
} from '@proxyos/tunnels'
import type { TunnelProvider, CloudflareTunnelCreds, TailscaleFunnelCreds, NgrokCreds } from '@proxyos/tunnels'
import { publicProcedure, operatorProcedure, router } from '../trpc'

type ProviderRow = typeof tunnelProviders.$inferSelect

const credentialsSchema = z.object({
  // Cloudflare
  accountId: z.string().optional(),
  apiToken: z.string().optional(),
  tunnelName: z.string().optional(),
  zoneId: z.string().optional(),
  // Tailscale
  authKey: z.string().optional(),
  tags: z.array(z.string()).optional(),
  // ngrok
  authToken: z.string().optional(),
  region: z.string().optional(),
  reservedDomain: z.string().optional(),
})

function buildProvider(row: Pick<ProviderRow, 'id' | 'type' | 'credentials'>): TunnelProvider {
  const creds = JSON.parse(row.credentials) as unknown
  if (row.type === 'cloudflare') return new CloudflareTunnelProvider(row.id, creds as CloudflareTunnelCreds)
  if (row.type === 'tailscale') return new TailscaleFunnelProvider(row.id, creds as TailscaleFunnelCreds)
  return new NgrokProvider(row.id, creds as NgrokCreds)
}

function tunnelServerName(type: string): string {
  return `tunnel_${type.replace(/[^a-z0-9]/g, '_')}`
}

function tunnelListenPorts(type: string): string[] {
  if (type === 'cloudflare') return [`:${TUNNEL_PORTS.cloudflare}`]
  if (type === 'ngrok') return [`:${TUNNEL_PORTS.ngrok}`]
  return TUNNEL_PORTS.tailscale.map(p => `:${p}`)
}

function tunnelLocalPort(type: string): number {
  if (type === 'cloudflare') return TUNNEL_PORTS.cloudflare
  if (type === 'ngrok') return TUNNEL_PORTS.ngrok
  return TUNNEL_PORTS.tailscale[0]
}

function firstUpstreamDial(upstreamsJson: string): string {
  try {
    const arr = JSON.parse(upstreamsJson) as unknown[]
    const first = arr[0]
    if (typeof first === 'string') {
      try { return new URL(first).host } catch { return first }
    }
    if (first && typeof first === 'object') {
      const o = first as Record<string, unknown>
      if (typeof o['dial'] === 'string') return o['dial']
      if (typeof o['url'] === 'string') {
        try { return new URL(o['url'] as string).host } catch { return o['url'] as string }
      }
    }
  } catch { /* fall through */ }
  return 'localhost:80'
}

function buildTunnelCaddyRoute(routeId: string, domain: string, upstreamDial: string): CaddyRoute {
  return {
    '@id': `tunnel-route-${routeId}`,
    match: [{ host: [domain] }],
    handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: upstreamDial }] }],
    terminal: true,
  }
}

export const tunnelsRouter = router({
  providers: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db.select().from(tunnelProviders)
      return rows.map(r => ({
        id: r.id,
        type: r.type as 'cloudflare' | 'tailscale' | 'ngrok',
        name: r.name,
        enabled: r.enabled,
        status: r.status,
        processStatus: r.processStatus,
        processRestartCount: r.processRestartCount,
        lastHealthStatus: r.lastHealthStatus,
        lastHealthCheckAt: r.lastHealthCheckAt,
        lastTestedAt: r.lastTestedAt,
        createdAt: r.createdAt,
      }))
    }),

    get: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(tunnelProviders).where(eq(tunnelProviders.id, input.id)).get()
        if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
        const health = tunnelManager.get(row.id) ? await tunnelManager.getHealth(row.id) : null
        const connectedRoutes = await ctx.db.select().from(tunnelRoutes)
          .where(and(eq(tunnelRoutes.tunnelProviderId, row.id), eq(tunnelRoutes.status, 'active')))
        return {
          id: row.id,
          type: row.type as 'cloudflare' | 'tailscale' | 'ngrok',
          name: row.name,
          enabled: row.enabled,
          status: row.status,
          processStatus: row.processStatus,
          processRestartCount: row.processRestartCount,
          lastHealthStatus: row.lastHealthStatus,
          lastHealthError: row.lastHealthError,
          lastHealthCheckAt: row.lastHealthCheckAt,
          lastTestedAt: row.lastTestedAt,
          stateJson: row.stateJson,
          createdAt: row.createdAt,
          liveHealth: health,
          activeRouteCount: connectedRoutes.length,
        }
      }),

    create: operatorProcedure
      .input(z.object({
        type: z.enum(['cloudflare', 'tailscale', 'ngrok']),
        name: z.string().min(1).max(100),
        credentials: credentialsSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        const id = nanoid()
        await ctx.db.insert(tunnelProviders).values({
          id,
          type: input.type,
          name: input.name,
          credentials: JSON.stringify(input.credentials),
          enabled: false,
          status: 'disconnected',
          processRestartCount: 0,
          createdAt: new Date(),
        })
        await ctx.db.insert(tunnelEvents).values({
          id: nanoid(),
          tunnelProviderId: id,
          routeId: null,
          eventType: 'provider_created',
          severity: 'info',
          message: `Tunnel provider "${input.name}" (${input.type}) created`,
          detailsJson: null,
          occurredAt: new Date(),
        })
        return { id, success: true }
      }),

    update: operatorProcedure
      .input(z.object({
        id: z.string(),
        patch: z.object({
          name: z.string().min(1).max(100).optional(),
          credentials: credentialsSchema.optional(),
          enabled: z.boolean().optional(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(tunnelProviders).where(eq(tunnelProviders.id, input.id)).get()
        if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

        const update: Record<string, unknown> = {}
        if (input.patch.name !== undefined) update.name = input.patch.name
        if (input.patch.credentials !== undefined) update.credentials = JSON.stringify(input.patch.credentials)
        if (input.patch.enabled !== undefined) update.enabled = input.patch.enabled

        await ctx.db.update(tunnelProviders).set(update).where(eq(tunnelProviders.id, input.id))

        if (input.patch.enabled === true && !tunnelManager.get(input.id)) {
          const merged = { ...row, ...update, id: input.id }
          const provider = buildProvider({
            id: merged.id,
            type: merged.type,
            credentials: merged.credentials as string,
          })
          try {
            await tunnelManager.startProvider(provider)
            await ctx.db.update(tunnelProviders).set({
              processStatus: 'starting',
              status: 'connected',
            }).where(eq(tunnelProviders.id, input.id))
          } catch (err) {
            await ctx.db.update(tunnelProviders).set({
              processStatus: 'crashed',
              status: 'error',
              lastHealthError: (err as Error).message,
            }).where(eq(tunnelProviders.id, input.id))
          }
        } else if (input.patch.enabled === false) {
          await tunnelManager.stopProvider(input.id)
          await ctx.db.update(tunnelProviders).set({
            processStatus: 'stopped',
            status: 'disconnected',
          }).where(eq(tunnelProviders.id, input.id))
        }

        return { success: true }
      }),

    delete: operatorProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(tunnelProviders).where(eq(tunnelProviders.id, input.id)).get()
        if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

        const activeRoutes = await ctx.db.select().from(tunnelRoutes)
          .where(eq(tunnelRoutes.tunnelProviderId, input.id))
        if (activeRoutes.length > 0) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Provider has ${activeRoutes.length} active tunnel route(s). Disable them first.`,
          })
        }

        await tunnelManager.stopProvider(input.id)
        await ctx.db.delete(tunnelProviders).where(eq(tunnelProviders.id, input.id))
        return { success: true }
      }),

    test: operatorProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(tunnelProviders).where(eq(tunnelProviders.id, input.id)).get()
        if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

        const provider = buildProvider(row)
        const result = await provider.test()

        await ctx.db.update(tunnelProviders).set({
          status: result.ok ? 'connected' : 'error',
          lastTestedAt: new Date(),
          lastHealthStatus: result.ok ? 'healthy' : 'unhealthy',
          lastHealthCheckAt: new Date(),
          lastHealthError: result.error ?? null,
        }).where(eq(tunnelProviders.id, input.id))

        return result
      }),

    logs: publicProcedure
      .input(z.object({ id: z.string(), lines: z.number().int().min(1).max(1000).default(200) }))
      .query(({ input }) => {
        return tunnelManager.getLogs(input.id, input.lines)
      }),

    restart: operatorProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const row = await ctx.db.select().from(tunnelProviders).where(eq(tunnelProviders.id, input.id)).get()
        if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

        if (!tunnelManager.get(input.id)) {
          const provider = buildProvider(row)
          await tunnelManager.startProvider(provider)
        } else {
          await tunnelManager.restartProvider(input.id)
        }

        await ctx.db.update(tunnelProviders).set({
          processStatus: 'starting',
          status: 'connected',
        }).where(eq(tunnelProviders.id, input.id))

        await ctx.db.insert(tunnelEvents).values({
          id: nanoid(),
          tunnelProviderId: input.id,
          routeId: null,
          eventType: 'provider_restart',
          severity: 'info',
          message: `Provider "${row.name}" restarted`,
          detailsJson: null,
          occurredAt: new Date(),
        })

        return { success: true }
      }),
  }),

  routes: router({
    enable: operatorProcedure
      .input(z.object({
        routeId: z.string(),
        providerId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
        if (!route) throw new TRPCError({ code: 'NOT_FOUND', message: 'Route not found' })

        const providerRow = await ctx.db.select().from(tunnelProviders)
          .where(eq(tunnelProviders.id, input.providerId)).get()
        if (!providerRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tunnel provider not found' })

        if (route.exposureMode === 'tunnel' && route.tunnelRouteId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Route already has tunnel exposure. Disable first.' })
        }

        let provider = tunnelManager.get(input.providerId)
        if (!provider) {
          provider = buildProvider(providerRow)
          await tunnelManager.startProvider(provider)
          await ctx.db.update(tunnelProviders).set({ processStatus: 'starting', status: 'connected' })
            .where(eq(tunnelProviders.id, input.providerId))
        }

        const localPort = tunnelLocalPort(providerRow.type)
        const creds = JSON.parse(providerRow.credentials) as Record<string, unknown>

        let result
        try {
          result = await tunnelManager.addRouteToTunnel(input.routeId, input.providerId, {
            routeId: input.routeId,
            desiredHostname: route.domain,
            localPort,
            protocol: 'http',
            zoneId: typeof creds['zoneId'] === 'string' ? creds['zoneId'] : undefined,
          })
        } catch (err) {
          await ctx.db.insert(tunnelEvents).values({
            id: nanoid(), tunnelProviderId: input.providerId, routeId: input.routeId,
            eventType: 'route_add_failed', severity: 'error',
            message: `Failed to provision tunnel route: ${(err as Error).message}`,
            detailsJson: null, occurredAt: new Date(),
          })
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: (err as Error).message })
        }

        // Ensure inner Caddy server exists for this tunnel type
        const serverName = tunnelServerName(providerRow.type)
        const hasServer = await ctx.caddy.hasServer(serverName)
        if (!hasServer) {
          await ctx.caddy.upsertServer(serverName, { listen: tunnelListenPorts(providerRow.type), routes: [] })
        }

        const innerCaddy = new CaddyClient({ serverName })
        const upstreamDial = firstUpstreamDial(route.upstreams)
        await innerCaddy.addRoute(buildTunnelCaddyRoute(input.routeId, route.domain, upstreamDial))

        const tunnelRouteId = nanoid()
        await ctx.db.insert(tunnelRoutes).values({
          id: tunnelRouteId,
          routeId: input.routeId,
          tunnelProviderId: input.providerId,
          providerRouteRef: result.routeRef,
          publicUrl: result.publicUrl,
          internalListenPort: localPort,
          status: 'active',
          provisionedAt: new Date(),
          lastError: null,
          metaJson: JSON.stringify(result.meta),
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        await ctx.db.update(routes).set({
          exposureMode: 'tunnel',
          tunnelRouteId,
          tunnelPublicUrl: result.publicUrl,
          updatedAt: new Date(),
        }).where(eq(routes.id, input.routeId))

        await ctx.db.insert(tunnelEvents).values({
          id: nanoid(), tunnelProviderId: input.providerId, routeId: input.routeId,
          eventType: 'route_added', severity: 'info',
          message: `Route "${route.domain}" exposed via ${providerRow.type}: ${result.publicUrl}`,
          detailsJson: JSON.stringify({ publicUrl: result.publicUrl, routeRef: result.routeRef }),
          occurredAt: new Date(),
        })

        return { success: true, publicUrl: result.publicUrl, tunnelRouteId }
      }),

    disable: operatorProcedure
      .input(z.object({ routeId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
        if (!route) throw new TRPCError({ code: 'NOT_FOUND', message: 'Route not found' })

        const tunnelRoute = route.tunnelRouteId
          ? await ctx.db.select().from(tunnelRoutes).where(eq(tunnelRoutes.id, route.tunnelRouteId)).get()
          : null

        if (tunnelRoute) {
          try {
            await tunnelManager.removeRouteFromTunnel(input.routeId, tunnelRoute.tunnelProviderId)
          } catch { /* best-effort */ }

          const providerRow = await ctx.db.select().from(tunnelProviders)
            .where(eq(tunnelProviders.id, tunnelRoute.tunnelProviderId)).get()
          if (providerRow) {
            const innerCaddy = new CaddyClient({ serverName: tunnelServerName(providerRow.type) })
            try { await innerCaddy.removeRoute(`tunnel-route-${input.routeId}`) } catch { /* best-effort */ }
          }

          await ctx.db.delete(tunnelRoutes).where(eq(tunnelRoutes.id, tunnelRoute.id))
        }

        await ctx.db.update(routes).set({
          exposureMode: 'direct',
          tunnelRouteId: null,
          tunnelPublicUrl: null,
          updatedAt: new Date(),
        }).where(eq(routes.id, input.routeId))

        await ctx.db.insert(tunnelEvents).values({
          id: nanoid(),
          tunnelProviderId: tunnelRoute?.tunnelProviderId ?? null,
          routeId: input.routeId,
          eventType: 'route_removed',
          severity: 'info',
          message: `Tunnel exposure removed from route "${route.domain}"`,
          detailsJson: null,
          occurredAt: new Date(),
        })

        return { success: true }
      }),

    switchProvider: operatorProcedure
      .input(z.object({ routeId: z.string(), newProviderId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
        if (!route) throw new TRPCError({ code: 'NOT_FOUND', message: 'Route not found' })

        if (route.exposureMode === 'tunnel') {
          // Disable current tunnel first (inline to avoid double route check)
          const tunnelRoute = route.tunnelRouteId
            ? await ctx.db.select().from(tunnelRoutes).where(eq(tunnelRoutes.id, route.tunnelRouteId)).get()
            : null
          if (tunnelRoute) {
            try { await tunnelManager.removeRouteFromTunnel(input.routeId, tunnelRoute.tunnelProviderId) } catch { /* ignore */ }
            const providerRow = await ctx.db.select().from(tunnelProviders)
              .where(eq(tunnelProviders.id, tunnelRoute.tunnelProviderId)).get()
            if (providerRow) {
              const innerCaddy = new CaddyClient({ serverName: tunnelServerName(providerRow.type) })
              try { await innerCaddy.removeRoute(`tunnel-route-${input.routeId}`) } catch { /* ignore */ }
            }
            await ctx.db.delete(tunnelRoutes).where(eq(tunnelRoutes.id, tunnelRoute.id))
          }
          await ctx.db.update(routes).set({ exposureMode: 'direct', tunnelRouteId: null, tunnelPublicUrl: null, updatedAt: new Date() })
            .where(eq(routes.id, input.routeId))
        }

        // Now enable with the new provider — delegate to enable logic
        const newProvider = await ctx.db.select().from(tunnelProviders)
          .where(eq(tunnelProviders.id, input.newProviderId)).get()
        if (!newProvider) throw new TRPCError({ code: 'NOT_FOUND', message: 'New tunnel provider not found' })

        let provider = tunnelManager.get(input.newProviderId)
        if (!provider) {
          provider = buildProvider(newProvider)
          await tunnelManager.startProvider(provider)
        }

        const creds = JSON.parse(newProvider.credentials) as Record<string, unknown>
        const localPort = tunnelLocalPort(newProvider.type)
        const result = await tunnelManager.addRouteToTunnel(input.routeId, input.newProviderId, {
          routeId: input.routeId,
          desiredHostname: route.domain,
          localPort,
          protocol: 'http',
          zoneId: typeof creds['zoneId'] === 'string' ? creds['zoneId'] : undefined,
        })

        const serverName = tunnelServerName(newProvider.type)
        if (!await ctx.caddy.hasServer(serverName)) {
          await ctx.caddy.upsertServer(serverName, { listen: tunnelListenPorts(newProvider.type), routes: [] })
        }
        const innerCaddy = new CaddyClient({ serverName })
        await innerCaddy.addRoute(buildTunnelCaddyRoute(input.routeId, route.domain, firstUpstreamDial(route.upstreams)))

        const tunnelRouteId = nanoid()
        await ctx.db.insert(tunnelRoutes).values({
          id: tunnelRouteId, routeId: input.routeId, tunnelProviderId: input.newProviderId,
          providerRouteRef: result.routeRef, publicUrl: result.publicUrl,
          internalListenPort: localPort, status: 'active', provisionedAt: new Date(),
          lastError: null, metaJson: JSON.stringify(result.meta), createdAt: new Date(), updatedAt: new Date(),
        })
        await ctx.db.update(routes).set({
          exposureMode: 'tunnel', tunnelRouteId, tunnelPublicUrl: result.publicUrl, updatedAt: new Date(),
        }).where(eq(routes.id, input.routeId))

        await ctx.db.insert(tunnelEvents).values({
          id: nanoid(), tunnelProviderId: input.newProviderId, routeId: input.routeId,
          eventType: 'route_provider_switched', severity: 'info',
          message: `Route "${route.domain}" switched to ${newProvider.type}: ${result.publicUrl}`,
          detailsJson: null, occurredAt: new Date(),
        })

        return { success: true, publicUrl: result.publicUrl }
      }),
  }),

  events: router({
    list: publicProcedure
      .input(z.object({
        tunnelProviderId: z.string().optional(),
        routeId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }))
      .query(async ({ ctx, input }) => {
        const conditions = []
        if (input.tunnelProviderId) conditions.push(eq(tunnelEvents.tunnelProviderId, input.tunnelProviderId))
        if (input.routeId) conditions.push(eq(tunnelEvents.routeId, input.routeId))

        const rows = await ctx.db.select().from(tunnelEvents)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(tunnelEvents.occurredAt))
          .limit(input.limit)

        return rows.map(r => ({
          id: r.id,
          tunnelProviderId: r.tunnelProviderId,
          routeId: r.routeId,
          eventType: r.eventType,
          severity: r.severity,
          message: r.message,
          detailsJson: r.detailsJson,
          occurredAt: r.occurredAt,
        }))
      }),
  }),
})
