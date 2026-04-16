import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { routes, ssoProviders } from '@proxyos/db'
import { adapterRegistry } from '@proxyos/connect'
import { CloudflareAdapter } from '@proxyos/connect/cloudflare'
import { buildChainNodes } from '../chain/builder'
import { rollupStatus } from '../chain/health'
import { debugChain } from '../chain/debugger'
import { publicProcedure, router } from '../trpc'

export const chainRouter = router({
  getForRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) return { nodes: [], rollup: 'unknown' as const }
      const nodes = await buildChainNodes(route)
      return { nodes, rollup: rollupStatus(nodes) }
    }),

  debugChain: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })

      const upstreams = JSON.parse(route.upstreams) as { address: string }[]
      const upstreamUrl = upstreams[0] ? `http://${upstreams[0].address}` : ''

      let ssoForwardAuthUrl: string | null = null
      if (route.ssoEnabled && route.ssoProviderId) {
        const sso = await ctx.db.select().from(ssoProviders)
          .where(eq(ssoProviders.id, route.ssoProviderId)).get()
        ssoForwardAuthUrl = sso?.forwardAuthUrl ?? null
      }

      return debugChain(route.domain, upstreamUrl, ssoForwardAuthUrl)
    }),

  autoConfigSso: publicProcedure
    .input(z.object({ routeId: z.string(), connectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })

      const adapter = adapterRegistry.get(input.connectionId)
      if (!adapter) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Adapter not loaded' })

      const routeConfig = {
        id: route.id, domain: route.domain, upstreams: route.upstreams,
        tlsMode: route.tlsMode, ssoEnabled: route.ssoEnabled, ssoProviderId: route.ssoProviderId,
        agentId: route.agentId ?? null, enabled: route.enabled,
      }

      await adapter.onRouteCreated?.(routeConfig)
      return { ok: true, domain: route.domain, adapterType: adapter.type }
    }),

  fixDns: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })

      const cfAdapters = adapterRegistry.getByType('cloudflare') as CloudflareAdapter[]
      if (cfAdapters.length === 0) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No Cloudflare connection configured' })
      }

      const routeConfig = {
        id: route.id,
        domain: route.domain,
        upstreams: route.upstreams,
        tlsMode: route.tlsMode,
        ssoEnabled: route.ssoEnabled,
        ssoProviderId: route.ssoProviderId,
        agentId: route.agentId ?? null,
        enabled: route.enabled,
      }

      await Promise.all(cfAdapters.map(cf => cf.onRouteCreated(routeConfig)))
      return { ok: true, domain: route.domain }
    }),
})
