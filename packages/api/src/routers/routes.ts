import { TRPCError } from '@trpc/server'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { buildCaddyRoute, buildTlsPolicy } from '@proxyos/caddy'
import { dnsProviders, nanoid, routes, routeSecurity, routeTags, ssoProviders, auditLog, systemLog } from '@proxyos/db'
import { buildLogEntry } from './systemLog'
import { parseGeoIPConfig } from '../security/geoip'
import type { DnsProvider, DnsProviderType, Route, SSOProvider, SSOProviderType } from '@proxyos/types'
import { publicProcedure, operatorProcedure, router } from '../trpc'
import { insertRouteVersion } from './routeVersions'

const lbPolicies = ['round_robin', 'least_conn', 'ip_hash', 'random', 'first'] as const

const upstreamSchema = z.object({
  address: z.string().min(1),
  weight: z.number().int().min(1).max(100).optional(),
})

const createInput = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().min(1).max(253),
  upstreams: z.array(upstreamSchema).min(1),
  lbPolicy: z.enum(lbPolicies).default('round_robin'),
  tlsMode: z.enum(['auto', 'dns', 'internal', 'custom', 'off']).default('auto'),
  ssoEnabled: z.boolean().default(false),
  ssoProviderId: z.string().nullable().default(null),
  tlsDnsProviderId: z.string().nullable().default(null),
  compressionEnabled: z.boolean().default(true),
  healthCheckEnabled: z.boolean().default(true),
  healthCheckPath: z.string().default('/'),
})

const exposeInput = z.object({
  name: z.string().min(1).max(100),
  upstreamUrl: z.string().min(1),
  domain: z.string().min(1).max(253),
  tlsMode: z.enum(['auto', 'dns', 'internal', 'custom', 'off']).default('auto'),
  tlsDnsProviderId: z.string().nullable().default(null),
  ssoEnabled: z.boolean().default(false),
  ssoProviderId: z.string().nullable().default(null),
})

function rowToRoute(row: typeof routes.$inferSelect): Route {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    enabled: row.enabled,
    upstreamType: row.upstreamType as Route['upstreamType'],
    upstreams: JSON.parse(row.upstreams) as Route['upstreams'],
    tlsMode: row.tlsMode as Route['tlsMode'],
    tlsDnsProviderId: row.tlsDnsProviderId,
    ssoEnabled: row.ssoEnabled,
    ssoProviderId: row.ssoProviderId,
    rateLimit: row.rateLimit ? (JSON.parse(row.rateLimit) as Route['rateLimit']) : null,
    ipAllowlist: row.ipAllowlist ? (JSON.parse(row.ipAllowlist) as string[]) : null,
    basicAuth: row.basicAuth ? (JSON.parse(row.basicAuth) as Route['basicAuth']) : null,
    headers: row.headers ? (JSON.parse(row.headers) as Record<string, unknown>) : null,
    lbPolicy: (row.lbPolicy ?? 'round_robin') as Route['lbPolicy'],
    healthCheckEnabled: row.healthCheckEnabled,
    healthCheckPath: row.healthCheckPath,
    healthCheckInterval: row.healthCheckInterval,
    compressionEnabled: row.compressionEnabled,
    websocketEnabled: row.websocketEnabled,
    http2Enabled: row.http2Enabled,
    http3Enabled: row.http3Enabled,
    lastTrafficAt: row.lastTrafficAt ?? null,
    archivedAt: row.archivedAt ?? null,
    wafMode: (row.wafMode as Route['wafMode']) ?? 'off',
    wafExclusions: row.wafExclusions ? JSON.parse(row.wafExclusions) as string[] : null,
    rateLimitKey: row.rateLimitKey ?? null,
    tunnelProviderId: row.tunnelProviderId ?? null,
    oauthProxyProviderId: row.oauthProxyProviderId ?? null,
    oauthProxyAllowlist: row.oauthProxyAllowlist ? JSON.parse(row.oauthProxyAllowlist) as string[] : null,
    stagingUpstreams: row.stagingUpstreams ? JSON.parse(row.stagingUpstreams) as Route['stagingUpstreams'] : null,
    trafficSplitPct: row.trafficSplitPct ?? null,
    mirrorUpstream: row.mirrorUpstream ?? null,
    mirrorSampleRate: row.mirrorSampleRate ?? null,
    accessosGroups: (row as Record<string, unknown>).accessosGroups
      ? JSON.parse((row as Record<string, unknown>).accessosGroups as string) as string[]
      : null,
    accessosProviderId: ((row as Record<string, unknown>).accessosProviderId as string) ?? null,
    mxwatchDomain: ((row as Record<string, unknown>).mxwatchDomain as string) ?? null,
    maintenanceMode: Boolean((row as Record<string, unknown>).maintenanceMode),
    maintenanceSavedUpstreams: (row as Record<string, unknown>).maintenanceSavedUpstreams
      ? JSON.parse((row as Record<string, unknown>).maintenanceSavedUpstreams as string) as Route['maintenanceSavedUpstreams']
      : null,
    forceSSL: Boolean(row.forceSSL),
    hstsEnabled: Boolean(row.hstsEnabled),
    hstsSubdomains: Boolean(row.hstsSubdomains),
    trustUpstreamHeaders: Boolean(row.trustUpstreamHeaders),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function syncRouteToCaddy(ctx: { db: ReturnType<typeof import('@proxyos/db').getDb>; caddy: import('@proxyos/caddy').CaddyClient }, route: Route): Promise<void> {
  let ssoProvider: SSOProvider | null = null
  if (route.ssoEnabled && route.ssoProviderId) {
    const row = await ctx.db.select().from(ssoProviders).where(eq(ssoProviders.id, route.ssoProviderId)).get()
    if (row) ssoProvider = rowToSSOProvider(row)
  }
  let dnsProvider: DnsProvider | null = null
  if (route.tlsMode === 'dns' && route.tlsDnsProviderId) {
    const row = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, route.tlsDnsProviderId)).get()
    if (row) dnsProvider = rowToDnsProvider(row)
  }
  const secRow = await ctx.db.select().from(routeSecurity).where(eq(routeSecurity.routeId, route.id)).get()
  const geoipConfig = parseGeoIPConfig(secRow?.geoipConfig)
  const tlsPolicy = buildTlsPolicy(route, dnsProvider)
  if (tlsPolicy) await ctx.caddy.upsertTlsPolicy(tlsPolicy)
  await ctx.caddy.updateRoute(route.id, buildCaddyRoute(route, { ssoProvider, dnsProvider, geoipConfig }))
}

function rowToDnsProvider(row: typeof dnsProviders.$inferSelect): DnsProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.type as DnsProviderType,
    credentials: JSON.parse(row.credentials) as Record<string, string>,
    enabled: row.enabled,
    createdAt: row.createdAt,
  }
}

function rowToSSOProvider(row: typeof ssoProviders.$inferSelect): SSOProvider {
  return {
    id: row.id,
    name: row.name,
    type: row.type as SSOProviderType,
    forwardAuthUrl: row.forwardAuthUrl,
    authResponseHeaders: JSON.parse(row.authResponseHeaders) as string[],
    trustedIPs: JSON.parse(row.trustedIPs) as string[],
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt,
    testStatus: row.testStatus as SSOProvider['testStatus'],
    createdAt: row.createdAt,
  }
}

export const routesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(routes)
    return rows.map(rowToRoute)
  }),

  listByAgent: publicProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(routes).where(eq(routes.agentId, input.agentId))
      return rows.map(rowToRoute)
    }),

  create: operatorProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    if (input.domain.startsWith('*.') && input.tlsMode === 'auto') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Wildcard domains require tlsMode=dns or tlsMode=internal — HTTP-01 cannot validate wildcards' })
    }

    const existing = await ctx.db.select().from(routes).where(eq(routes.domain, input.domain)).get()
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: `${input.domain} already has a route` })
    }

    let ssoProvider: SSOProvider | null = null
    if (input.ssoEnabled) {
      if (!input.ssoProviderId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'ssoProviderId required when ssoEnabled' })
      }
      const row = await ctx.db.select().from(ssoProviders).where(eq(ssoProviders.id, input.ssoProviderId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'SSO provider not found' })
      ssoProvider = rowToSSOProvider(row)
    }

    let dnsProvider: DnsProvider | null = null
    if (input.tlsMode === 'dns') {
      if (!input.tlsDnsProviderId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'tlsDnsProviderId required when tlsMode=dns' })
      }
      const row = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, input.tlsDnsProviderId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'DNS provider not found' })
      dnsProvider = rowToDnsProvider(row)
    }

    const now = new Date()
    const id = nanoid()
    const route: Route = {
      id,
      name: input.name,
      domain: input.domain,
      enabled: true,
      upstreamType: 'http',
      upstreams: input.upstreams,
      lbPolicy: input.lbPolicy,
      tlsMode: input.tlsMode,
      tlsDnsProviderId: input.tlsDnsProviderId ?? null,
      ssoEnabled: input.ssoEnabled,
      ssoProviderId: input.ssoProviderId,
      healthCheckEnabled: input.healthCheckEnabled,
      healthCheckPath: input.healthCheckPath,
      healthCheckInterval: 30,
      compressionEnabled: input.compressionEnabled,
      websocketEnabled: true,
      http2Enabled: true,
      http3Enabled: true,
      createdAt: now,
      updatedAt: now,
    }

    await ctx.db.insert(routes).values({
      id,
      name: route.name,
      domain: route.domain,
      enabled: true,
      upstreamType: route.upstreamType,
      upstreams: JSON.stringify(route.upstreams),
      lbPolicy: route.lbPolicy ?? 'round_robin',
      tlsMode: route.tlsMode,
      tlsDnsProviderId: route.tlsDnsProviderId,
      ssoEnabled: route.ssoEnabled,
      ssoProviderId: route.ssoProviderId,
      healthCheckEnabled: route.healthCheckEnabled ?? true,
      healthCheckPath: route.healthCheckPath ?? '/',
      healthCheckInterval: route.healthCheckInterval ?? 30,
      compressionEnabled: route.compressionEnabled ?? true,
      websocketEnabled: true,
      http2Enabled: true,
      http3Enabled: true,
      createdAt: now,
      updatedAt: now,
    })

    try {
      const tlsPolicy = buildTlsPolicy(route, dnsProvider)
      if (tlsPolicy) await ctx.caddy.upsertTlsPolicy(tlsPolicy)
      await ctx.caddy.addRoute(buildCaddyRoute(route, { ssoProvider, dnsProvider }))
    } catch (err) {
      await ctx.db.delete(routes).where(eq(routes.id, id))
      await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to push route "${input.domain}" to Caddy`, {
        domain: input.domain,
        tlsMode: input.tlsMode,
        upstreams: input.upstreams,
        error: (err as Error).message,
        stack: (err as Error).stack,
      })).catch(() => {})
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to push route to Caddy: ${(err as Error).message}`,
      })
    }

    await ctx.db.insert(auditLog).values({
      id: nanoid(),
      action: 'route.create',
      resourceType: 'route',
      resourceId: id,
      resourceName: route.domain,
      actor: 'user',
      detail: JSON.stringify({ upstreams: route.upstreams, tlsMode: route.tlsMode, ssoEnabled: route.ssoEnabled }),
      createdAt: now,
    })
    await insertRouteVersion(ctx.db, route, 'user', 'created')

    return route
  }),

  expose: operatorProcedure.input(exposeInput).mutation(async ({ ctx, input }) => {
    if (input.domain.startsWith('*.') && input.tlsMode === 'auto') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Wildcard domains require tlsMode=dns or tlsMode=internal — HTTP-01 cannot validate wildcards' })
    }

    if (!(await ctx.caddy.health())) {
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Caddy admin API is not reachable. Start Caddy before exposing a service.',
      })
    }

    const existing = await ctx.db.select().from(routes).where(eq(routes.domain, input.domain)).get()
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: `${input.domain} already has a route` })
    }

    let ssoProvider: SSOProvider | null = null
    if (input.ssoEnabled) {
      if (!input.ssoProviderId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'ssoProviderId required when ssoEnabled' })
      }
      const row = await ctx.db.select().from(ssoProviders).where(eq(ssoProviders.id, input.ssoProviderId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'SSO provider not found' })
      ssoProvider = rowToSSOProvider(row)
    }

    let dnsProvider: DnsProvider | null = null
    if (input.tlsMode === 'dns') {
      if (!input.tlsDnsProviderId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'tlsDnsProviderId required when tlsMode=dns' })
      }
      const row = await ctx.db.select().from(dnsProviders).where(eq(dnsProviders.id, input.tlsDnsProviderId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'DNS provider not found' })
      dnsProvider = rowToDnsProvider(row)
    }

    const now = new Date()
    const id = nanoid()
    const upstreamAddress = input.upstreamUrl.replace(/^https?:\/\//, '')
    const route: Route = {
      id,
      name: input.name,
      domain: input.domain,
      enabled: true,
      upstreamType: 'http',
      upstreams: [{ address: upstreamAddress }],
      tlsMode: input.tlsMode,
      tlsDnsProviderId: input.tlsDnsProviderId ?? null,
      ssoEnabled: input.ssoEnabled,
      ssoProviderId: input.ssoProviderId,
      healthCheckEnabled: true,
      healthCheckPath: '/',
      healthCheckInterval: 30,
      compressionEnabled: true,
      websocketEnabled: true,
      http2Enabled: true,
      http3Enabled: true,
      createdAt: now,
      updatedAt: now,
    }

    await ctx.db.insert(routes).values({
      id,
      name: route.name,
      domain: route.domain,
      enabled: true,
      upstreamType: route.upstreamType,
      upstreams: JSON.stringify(route.upstreams),
      tlsMode: route.tlsMode,
      tlsDnsProviderId: route.tlsDnsProviderId,
      ssoEnabled: route.ssoEnabled,
      ssoProviderId: route.ssoProviderId,
      healthCheckEnabled: true,
      healthCheckPath: '/',
      healthCheckInterval: 30,
      compressionEnabled: true,
      websocketEnabled: true,
      http2Enabled: true,
      http3Enabled: true,
      createdAt: now,
      updatedAt: now,
    })

    try {
      const tlsPolicy = buildTlsPolicy(route, dnsProvider)
      if (tlsPolicy) await ctx.caddy.upsertTlsPolicy(tlsPolicy)
      await ctx.caddy.addRoute(buildCaddyRoute(route, { ssoProvider, dnsProvider }))
    } catch (err) {
      await ctx.db.delete(routes).where(eq(routes.id, id))
      await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to expose "${input.domain}" in Caddy`, {
        domain: input.domain,
        tlsMode: input.tlsMode,
        upstreamUrl: input.upstreamUrl,
        error: (err as Error).message,
        stack: (err as Error).stack,
      })).catch(() => {})
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to push route to Caddy: ${(err as Error).message}`,
      })
    }

    await ctx.db.insert(auditLog).values({
      id: nanoid(),
      action: 'route.expose',
      resourceType: 'route',
      resourceId: id,
      resourceName: route.domain,
      actor: 'user',
      detail: JSON.stringify({ upstreamUrl: input.upstreamUrl, ssoEnabled: input.ssoEnabled, tlsMode: input.tlsMode }),
      createdAt: now,
    })
    await insertRouteVersion(ctx.db, route, 'user', 'exposed')

    return {
      success: true,
      routeId: id,
      domain: route.domain,
      url: route.tlsMode === 'off' ? `http://${route.domain}` : `https://${route.domain}`,
      ssoEnabled: route.ssoEnabled,
      certStatus: route.tlsMode === 'off' ? 'none' : 'provisioning',
    }
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return rowToRoute(row)
    }),

  update: operatorProcedure
    .input(
      z.object({
        id: z.string(),
        patch: z.object({
          name: z.string().min(1).max(100).optional(),
          upstreams: z.array(upstreamSchema).min(1).optional(),
          lbPolicy: z.enum(lbPolicies).optional(),
          tlsMode: z.enum(['auto', 'dns', 'internal', 'custom', 'off']).optional(),
          tlsDnsProviderId: z.string().nullable().optional(),
          ssoEnabled: z.boolean().optional(),
          ssoProviderId: z.string().nullable().optional(),
          rateLimit: z.object({ requests: z.number().int().min(1), window: z.string() }).nullable().optional(),
          ipAllowlist: z.array(z.string()).nullable().optional(),
          basicAuth: z.object({ username: z.string(), password: z.string() }).nullable().optional(),
          compressionEnabled: z.boolean().optional(),
          websocketEnabled: z.boolean().optional(),
          http2Enabled: z.boolean().optional(),
          http3Enabled: z.boolean().optional(),
          healthCheckEnabled: z.boolean().optional(),
          healthCheckPath: z.string().optional(),
          healthCheckInterval: z.number().int().min(1).optional(),
          wafMode: z.enum(['off', 'detection', 'blocking']).optional(),
          wafExclusions: z.array(z.string()).nullable().optional(),
          rateLimitKey: z.string().nullable().optional(),
          tunnelProviderId: z.string().nullable().optional(),
          oauthProxyProviderId: z.string().nullable().optional(),
          oauthProxyAllowlist: z.array(z.string()).nullable().optional(),
          stagingUpstreams: z.array(z.object({ address: z.string(), weight: z.number().optional() })).nullable().optional(),
          trafficSplitPct: z.number().int().min(0).max(100).nullable().optional(),
          mirrorUpstream: z.string().nullable().optional(),
          mirrorSampleRate: z.number().int().min(0).max(100).nullable().optional(),
          accessosGroups: z.array(z.string()).nullable().optional(),
          accessosProviderId: z.string().nullable().optional(),
          mxwatchDomain: z.string().nullable().optional(),
          forceSSL: z.boolean().optional(),
          hstsEnabled: z.boolean().optional(),
          hstsSubdomains: z.boolean().optional(),
          trustUpstreamHeaders: z.boolean().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const update: Record<string, unknown> = { updatedAt: new Date() }
      const p = input.patch
      if (p.name !== undefined) update.name = p.name
      if (p.upstreams !== undefined) update.upstreams = JSON.stringify(p.upstreams)
      if (p.lbPolicy !== undefined) update.lbPolicy = p.lbPolicy
      if (p.tlsMode !== undefined) update.tlsMode = p.tlsMode
      if (p.tlsDnsProviderId !== undefined) update.tlsDnsProviderId = p.tlsDnsProviderId
      if (p.ssoEnabled !== undefined) update.ssoEnabled = p.ssoEnabled
      if (p.ssoProviderId !== undefined) update.ssoProviderId = p.ssoProviderId
      if (p.rateLimit !== undefined) update.rateLimit = p.rateLimit ? JSON.stringify(p.rateLimit) : null
      if (p.ipAllowlist !== undefined) update.ipAllowlist = p.ipAllowlist ? JSON.stringify(p.ipAllowlist) : null
      if (p.basicAuth !== undefined) update.basicAuth = p.basicAuth ? JSON.stringify(p.basicAuth) : null
      if (p.compressionEnabled !== undefined) update.compressionEnabled = p.compressionEnabled
      if (p.websocketEnabled !== undefined) update.websocketEnabled = p.websocketEnabled
      if (p.http2Enabled !== undefined) update.http2Enabled = p.http2Enabled
      if (p.http3Enabled !== undefined) update.http3Enabled = p.http3Enabled
      if (p.healthCheckEnabled !== undefined) update.healthCheckEnabled = p.healthCheckEnabled
      if (p.healthCheckPath !== undefined) update.healthCheckPath = p.healthCheckPath
      if (p.healthCheckInterval !== undefined) update.healthCheckInterval = p.healthCheckInterval
      if (p.wafMode !== undefined) update.wafMode = p.wafMode
      if (p.wafExclusions !== undefined) update.wafExclusions = p.wafExclusions ? JSON.stringify(p.wafExclusions) : null
      if (p.rateLimitKey !== undefined) update.rateLimitKey = p.rateLimitKey
      if (p.tunnelProviderId !== undefined) update.tunnelProviderId = p.tunnelProviderId
      if (p.oauthProxyProviderId !== undefined) update.oauthProxyProviderId = p.oauthProxyProviderId
      if (p.oauthProxyAllowlist !== undefined) update.oauthProxyAllowlist = p.oauthProxyAllowlist ? JSON.stringify(p.oauthProxyAllowlist) : null
      if (p.stagingUpstreams !== undefined) update.stagingUpstreams = p.stagingUpstreams ? JSON.stringify(p.stagingUpstreams) : null
      if (p.trafficSplitPct !== undefined) update.trafficSplitPct = p.trafficSplitPct
      if (p.mirrorUpstream !== undefined) update.mirrorUpstream = p.mirrorUpstream
      if (p.mirrorSampleRate !== undefined) update.mirrorSampleRate = p.mirrorSampleRate
      if (p.accessosGroups !== undefined) update.accessosGroups = p.accessosGroups ? JSON.stringify(p.accessosGroups) : null
      if (p.accessosProviderId !== undefined) update.accessosProviderId = p.accessosProviderId
      if (p.mxwatchDomain !== undefined) update.mxwatchDomain = p.mxwatchDomain
      if (p.forceSSL !== undefined) update.forceSSL = p.forceSSL
      if (p.hstsEnabled !== undefined) update.hstsEnabled = p.hstsEnabled
      if (p.hstsSubdomains !== undefined) update.hstsSubdomains = p.hstsSubdomains
      if (p.trustUpstreamHeaders !== undefined) update.trustUpstreamHeaders = p.trustUpstreamHeaders

      await ctx.db.update(routes).set(update).where(eq(routes.id, input.id))

      const updated = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      const route = rowToRoute(updated!)
      try {
        await syncRouteToCaddy(ctx, route)
        // Force SSL: manage the HTTP redirect server based on whether any enabled route needs it
        const allRows = await ctx.db.select().from(routes).all()
        const needsRedirect = allRows.some(r => r.enabled && r.forceSSL && r.tlsMode !== 'off')
        if (needsRedirect) {
          await ctx.caddy.setHttpRedirectServer().catch(() => {})
        } else {
          await ctx.caddy.removeHttpRedirectServer().catch(() => {})
        }
      } catch (err) {
        await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to update route "${route.domain}" in Caddy`, {
          domain: route.domain,
          tlsMode: route.tlsMode,
          patch: input.patch,
          error: (err as Error).message,
          stack: (err as Error).stack,
        })).catch(() => {})
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to update Caddy: ${(err as Error).message}` })
      }

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'route.update',
        resourceType: 'route',
        resourceId: input.id,
        resourceName: route.domain,
        actor: 'user',
        detail: JSON.stringify(p),
        createdAt: new Date(),
      })
      await insertRouteVersion(ctx.db, route)
      return route
    }),

  toggle: operatorProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.update(routes).set({ enabled: input.enabled, updatedAt: new Date() }).where(eq(routes.id, input.id))
      if (input.enabled) {
        const updated = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
        await syncRouteToCaddy(ctx, rowToRoute(updated!))
      } else {
        await ctx.caddy.removeRoute(input.id)
      }
      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: input.enabled ? 'route.enable' : 'route.disable',
        resourceType: 'route',
        resourceId: input.id,
        resourceName: row.domain,
        actor: 'user',
        createdAt: new Date(),
      })
      return { success: true }
    }),

  test: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const upstreams = JSON.parse(row.upstreams) as Array<{ address: string }>
      const results: Array<{ address: string; ok: boolean; status?: number; latencyMs: number; error?: string }> = []
      for (const u of upstreams) {
        const url = u.address.startsWith('http') ? u.address : `http://${u.address}`
        const start = performance.now()
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)
        try {
          const res = await fetch(url + (row.healthCheckPath || '/'), { signal: controller.signal, redirect: 'manual' })
          results.push({ address: u.address, ok: res.status < 500, status: res.status, latencyMs: Math.round(performance.now() - start) })
        } catch (err) {
          results.push({ address: u.address, ok: false, latencyMs: Math.round(performance.now() - start), error: (err as Error).message })
        } finally {
          clearTimeout(timer)
        }
      }
      return { results }
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.caddy.removeRoute(input.id)
      await ctx.db.delete(routes).where(eq(routes.id, input.id))

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'route.delete',
        resourceType: 'route',
        resourceId: input.id,
        resourceName: row.domain,
        actor: 'user',
        createdAt: new Date(),
      })

      return { success: true }
    }),

  archive: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const now = new Date()
      await ctx.caddy.removeRoute(input.id)
      await ctx.db.update(routes).set({ enabled: false, archivedAt: now, updatedAt: now }).where(eq(routes.id, input.id))

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'route.archive',
        resourceType: 'route',
        resourceId: input.id,
        resourceName: row.domain,
        actor: 'user',
        createdAt: now,
      })

      return { success: true }
    }),

  unarchive: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const now = new Date()
      await ctx.db.update(routes).set({ enabled: true, archivedAt: null, updatedAt: now }).where(eq(routes.id, input.id))
      const updated = await ctx.db.select().from(routes).where(eq(routes.id, input.id)).get()
      await syncRouteToCaddy(ctx, rowToRoute(updated!))

      return { success: true }
    }),

  listStale: publicProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const cutoff = new Date(Date.now() - input.days * 86_400_000)
      const rows = await ctx.db.select().from(routes)
      return rows
        .filter(r => !r.archivedAt && r.enabled)
        .filter(r => !r.lastTrafficAt || r.lastTrafficAt < cutoff)
        .map(rowToRoute)
    }),

  listByTag: publicProcedure
    .input(z.object({ tag: z.string() }))
    .query(async ({ ctx, input }) => {
      const tagRows = await ctx.db.select({ routeId: routeTags.routeId }).from(routeTags).where(eq(routeTags.tag, input.tag))
      if (tagRows.length === 0) return []
      const ids = tagRows.map(r => r.routeId)
      const rows = await ctx.db.select().from(routes).where(inArray(routes.id, ids))
      return rows.map(rowToRoute)
    }),

  bulkEnable: operatorProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        const row = await ctx.db.select().from(routes).where(eq(routes.id, id)).get()
        if (!row) continue
        await ctx.db.update(routes).set({ enabled: true, updatedAt: new Date() }).where(eq(routes.id, id))
        try {
          const updated = await ctx.db.select().from(routes).where(eq(routes.id, id)).get()
          await syncRouteToCaddy(ctx, rowToRoute(updated!))
        } catch { /* best effort */ }
      }
      return { success: true, count: input.ids.length }
    }),

  bulkDisable: operatorProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        await ctx.db.update(routes).set({ enabled: false, updatedAt: new Date() }).where(eq(routes.id, id))
        try { await ctx.caddy.removeRoute(id) } catch { /* best effort */ }
      }
      return { success: true, count: input.ids.length }
    }),

  bulkArchive: operatorProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      for (const id of input.ids) {
        await ctx.db.update(routes).set({ enabled: false, archivedAt: now, updatedAt: now }).where(eq(routes.id, id))
        try { await ctx.caddy.removeRoute(id) } catch { /* best effort */ }
      }
      return { success: true, count: input.ids.length }
    }),

  bulkDelete: operatorProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        try { await ctx.caddy.removeRoute(id) } catch { /* best effort */ }
        await ctx.db.delete(routes).where(eq(routes.id, id))
      }
      return { success: true, count: input.ids.length }
    }),
})
