import { buildCaddyRoute } from '@proxyos/caddy'
import { bootstrapCaddy, type BootstrapResult } from '@proxyos/caddy/bootstrap'
import { getDb, routes as routesTable, ssoProviders as ssoTable } from '@proxyos/db'
import type { Route, SSOProvider, SSOProviderType } from '@proxyos/types'
import { loadAdapters } from './loader'

export async function bootstrapProxyOs(baseConfigPath: string): Promise<BootstrapResult> {
  void loadAdapters().catch(err => console.error('[connect] Failed to load adapters:', err))
  const db = getDb()
  return bootstrapCaddy({
    baseConfigPath,
    buildRoute: (route, providerMap) => buildCaddyRoute(route, { ssoProvider: resolveProvider(route, providerMap) }),
    getProviders: async () => {
      const rows = await db.select().from(ssoTable)
      const map = new Map<string, SSOProvider>()
      for (const row of rows) {
        map.set(row.id, {
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
        })
      }
      return map
    },
    getRoutes: async () => {
      const rows = await db.select().from(routesTable)
      return rows.map<Route>((row) => ({
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
        healthCheckEnabled: row.healthCheckEnabled,
        healthCheckPath: row.healthCheckPath,
        healthCheckInterval: row.healthCheckInterval,
        compressionEnabled: row.compressionEnabled,
        websocketEnabled: row.websocketEnabled,
        http2Enabled: row.http2Enabled,
        http3Enabled: row.http3Enabled,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
    },
  })
}

function resolveProvider(route: Route, map: Map<string, SSOProvider>): SSOProvider | null {
  if (!route.ssoEnabled || !route.ssoProviderId) return null
  return map.get(route.ssoProviderId) ?? null
}
