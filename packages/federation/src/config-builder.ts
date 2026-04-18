import { getDb, routes } from '@proxyos/db'
import { eq } from 'drizzle-orm'
import type { RouteConfig } from './protocol'

export interface NodeConfig {
  version: number
  routes: RouteConfig[]
  settings: Record<string, unknown>
}

export async function computeConfigForNode(siteId: string): Promise<NodeConfig> {
  const db = getDb()
  const siteRoutes = await db
    .select()
    .from(routes)
    .where(eq(routes.siteId, siteId))

  type RouteRow = typeof siteRoutes[number]
  const version = siteRoutes.reduce((max: number, r: RouteRow) => {
    const v = r.configVersion ?? 0
    return v > max ? v : max
  }, 0)

  return {
    version,
    routes: siteRoutes.map((r: RouteRow) => ({
      id: r.id,
      host: r.domain,
      upstream: r.upstreams,
      tls_mode: r.tlsMode ?? 'auto',
      websocket_enabled: r.websocketEnabled ?? false,
      origin: (r.origin as 'central' | 'local') ?? 'central',
      scope: (r.scope as 'exclusive' | 'local_only') ?? 'exclusive',
    })),
    settings: {},
  }
}
