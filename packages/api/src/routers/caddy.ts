import { TRPCError } from '@trpc/server'
import { resolve } from 'path'
import { readFile } from 'fs/promises'
import { buildCaddyRoute, buildTlsPolicy, buildTlsConnectionPolicy, validateCaddyRoute, type CaddyRoute } from '@proxyos/caddy'
import { dnsProviders, routes, routeRules, routeSecurity, ssoProviders, systemSettings } from '@proxyos/db'
import { eq } from 'drizzle-orm'
import type { DnsProvider, DnsProviderType, Route, RouteRule, SSOProvider, SSOProviderType } from '@proxyos/types'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const caddyRouter = router({
  status: publicProcedure.query(async ({ ctx }) => {
    const reachable = await ctx.caddy.health()
    const hasMain = reachable ? await ctx.caddy.hasServer('main') : false
    let upstreamCount = 0
    if (reachable && hasMain) {
      try {
        const cfg = await ctx.caddy.getConfig() as { apps?: { http?: { servers?: Record<string, { routes?: CaddyRoute[] }> } } }
        const r = cfg?.apps?.http?.servers?.main?.routes ?? []
        upstreamCount = r.length
      } catch { /* ignore */ }
    }
    return { reachable, hasMain, upstreamCount }
  }),

  config: publicProcedure.query(async ({ ctx }) => {
    if (!(await ctx.caddy.health())) {
      throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Caddy admin API not reachable' })
    }
    return await ctx.caddy.getConfig()
  }),

  rootCA: publicProcedure.query(async ({ ctx }) => {
    if (!(await ctx.caddy.health())) {
      throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Caddy admin API not reachable' })
    }
    try {
      const res = await fetch(`${process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019'}/pki/ca/local`)
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json() as { id?: string; name?: string; root_certificate?: string; intermediate_certificate?: string }
      return data
    } catch (err) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to fetch root CA: ${(err as Error).message}` })
    }
  }),

  reload: operatorProcedure.mutation(async ({ ctx }) => {
    if (!(await ctx.caddy.health())) {
      throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Caddy admin API not reachable' })
    }
    const baseConfigPath =
      process.env.CADDY_BASE_CONFIG_PATH ??
      resolve(process.cwd(), '../../caddy/base-config.json')
    if (!(await ctx.caddy.hasServer('main'))) {
      const raw = await readFile(baseConfigPath, 'utf8')
      await ctx.caddy.loadConfig(JSON.parse(raw))
    }

    const [routeRows, ssoRows, dnsRows, secRows, ruleRows, traceCfgRow] = await Promise.all([
      ctx.db.select().from(routes),
      ctx.db.select().from(ssoProviders),
      ctx.db.select().from(dnsProviders),
      ctx.db.select().from(routeSecurity),
      ctx.db.select().from(routeRules),
      ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'trace_config')).get(),
    ])
    const secMap = new Map(secRows.map(r => [r.routeId, r]))
    const rulesMap = new Map<string, RouteRule[]>()
    for (const r of ruleRows) {
      const list = rulesMap.get(r.routeId) ?? []
      list.push({
        id: r.id, routeId: r.routeId, priority: r.priority,
        matcherType: r.matcherType as RouteRule['matcherType'],
        matcherKey: r.matcherKey, matcherValue: r.matcherValue,
        action: r.action as RouteRule['action'],
        upstream: r.upstream, redirectUrl: r.redirectUrl,
        staticBody: r.staticBody, staticStatus: r.staticStatus,
        enabled: Boolean(r.enabled), createdAt: r.createdAt,
      })
      rulesMap.set(r.routeId, list)
    }
    const ssoMap = new Map<string, SSOProvider>(ssoRows.map((r) => [r.id, {
      id: r.id, name: r.name, type: r.type as SSOProviderType,
      forwardAuthUrl: r.forwardAuthUrl,
      authResponseHeaders: JSON.parse(r.authResponseHeaders),
      trustedIPs: JSON.parse(r.trustedIPs),
      enabled: r.enabled, lastTestedAt: r.lastTestedAt,
      testStatus: r.testStatus as SSOProvider['testStatus'],
      createdAt: r.createdAt,
    }]))
    const dnsMap = new Map<string, DnsProvider>(dnsRows.map((r) => [r.id, {
      id: r.id, name: r.name, type: r.type as DnsProviderType,
      credentials: JSON.parse(r.credentials),
      enabled: r.enabled, createdAt: r.createdAt,
    }]))

    const enabled = routeRows.filter((r) => r.enabled)
    const caddyRoutes: CaddyRoute[] = enabled.map((row) => {
      const route: Route = rowToRoute(row)
      const sec = secMap.get(row.id)
      const cr = buildCaddyRoute(route, {
        ssoProvider: route.ssoProviderId ? ssoMap.get(route.ssoProviderId) ?? null : null,
        dnsProvider: route.tlsDnsProviderId ? dnsMap.get(route.tlsDnsProviderId) ?? null : null,
        geoipConfig: sec?.geoipConfig ? JSON.parse(sec.geoipConfig) : null,
        mtlsConfig: sec?.mtlsConfig ? JSON.parse(sec.mtlsConfig) : null,
        botChallengeConfig: sec?.botChallengeConfig ? JSON.parse(sec.botChallengeConfig) : null,
        routeRules: rulesMap.get(row.id) ?? [],
        traceConfig: traceCfgRow?.value ? JSON.parse(traceCfgRow.value) : null,
      })
      const v = validateCaddyRoute(cr)
      if (!v.valid) console.warn(`[caddy] route ${route.domain} validation errors:`, v.issues)
      return cr
    })
    await ctx.caddy.replaceRoutes('main', caddyRoutes)

    for (const row of enabled) {
      const route = rowToRoute(row)
      const tls = buildTlsPolicy(route, route.tlsDnsProviderId ? dnsMap.get(route.tlsDnsProviderId) ?? null : null)
      if (tls) await ctx.caddy.upsertTlsPolicy(tls)
      const sec = secMap.get(row.id)
      const mtlsConfig = sec?.mtlsConfig ? JSON.parse(sec.mtlsConfig) : null
      if (mtlsConfig) {
        await ctx.caddy.upsertTlsConnectionPolicy(route.domain, buildTlsConnectionPolicy(route.domain, mtlsConfig))
      }
    }

    return { success: true, routes: caddyRoutes.length }
  }),
})

function rowToRoute(row: typeof routes.$inferSelect): Route {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    enabled: row.enabled,
    upstreamType: row.upstreamType as Route['upstreamType'],
    upstreams: JSON.parse(row.upstreams),
    tlsMode: row.tlsMode as Route['tlsMode'],
    tlsDnsProviderId: row.tlsDnsProviderId,
    ssoEnabled: row.ssoEnabled,
    ssoProviderId: row.ssoProviderId,
    rateLimit: row.rateLimit ? JSON.parse(row.rateLimit) : null,
    ipAllowlist: row.ipAllowlist ? JSON.parse(row.ipAllowlist) : null,
    basicAuth: row.basicAuth ? JSON.parse(row.basicAuth) : null,
    headers: row.headers ? JSON.parse(row.headers) : null,
    healthCheckEnabled: row.healthCheckEnabled,
    healthCheckPath: row.healthCheckPath,
    healthCheckInterval: row.healthCheckInterval,
    compressionEnabled: row.compressionEnabled,
    websocketEnabled: row.websocketEnabled,
    http2Enabled: row.http2Enabled,
    http3Enabled: row.http3Enabled,
    pathRewrite: row.pathRewrite ? JSON.parse(row.pathRewrite) : null,
    corsConfig: row.corsConfig ? JSON.parse(row.corsConfig) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    origin: (row.origin as Route['origin']) ?? 'central',
    scope: (row.scope as Route['scope']) ?? 'exclusive',
  }
}
