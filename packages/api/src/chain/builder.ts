import type { ChainNode } from '@proxyos/connect'
import { adapterRegistry, AuthentikAdapter, KeycloakAdapter, ZitadelAdapter } from '@proxyos/connect'
import { CloudflareAdapter } from '@proxyos/connect/cloudflare'

export interface RouteInfo {
  id: string
  domain: string
  upstreams: string          // JSON
  tlsMode: string
  ssoEnabled: boolean | number
  ssoProviderId?: string | null
  agentId?: string | null
  enabled: boolean | number
}

export async function buildChainNodes(route: RouteInfo): Promise<ChainNode[]> {
  const all = adapterRegistry.all()
  const results = await Promise.all(
    all.map(async (adapter) => {
      try {
        switch (adapter.type) {
          case 'cloudflare':
            return (adapter as CloudflareAdapter).getChainNodesForDomain(route.id, route.domain)
          case 'authentik':
            return (adapter as AuthentikAdapter).getChainNodesForDomain(route.id, route.domain)
          case 'keycloak':
            return (adapter as KeycloakAdapter).getChainNodesForDomain(route.id, route.domain)
          case 'zitadel':
            return (adapter as ZitadelAdapter).getChainNodesForDomain(route.id, route.domain)
          default:
            return adapter.getChainNodes(route.id)
        }
      } catch {
        return []
      }
    }),
  )
  return results.flat()
}
