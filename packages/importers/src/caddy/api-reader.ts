import type { ImportedRoute } from '../types'

interface CaddyRoute {
  '@id'?: string
  match?: Array<{ host?: string[] }>
  handle?: Array<{
    handler: string
    upstreams?: Array<{ dial: string }>
    transport?: { protocol?: string }
  }>
  terminal?: boolean
}

interface CaddyConfig {
  apps?: {
    http?: {
      servers?: Record<string, {
        routes?: CaddyRoute[]
      }>
    }
  }
}

export async function fetchCaddyConfig(adminUrl: string): Promise<CaddyConfig> {
  const res = await fetch(`${adminUrl}/config/`)
  if (!res.ok) throw new Error(`Caddy admin API error: ${res.status}`)
  return res.json() as Promise<CaddyConfig>
}

export function caddyRouteToProxyOSRoute(route: CaddyRoute): ImportedRoute | null {
  const host = route.match?.[0]?.host?.[0]
  if (!host) return null

  const reverseProxy = route.handle?.find(h => h.handler === 'reverse_proxy')
  const upstream = reverseProxy?.upstreams?.[0]?.dial ?? ''
  const isTLS = reverseProxy?.transport?.protocol === 'https'

  return {
    domain: host,
    upstream,
    protocol: isTLS ? 'https' : 'http',
    tlsDetected: isTLS,
    suggestedTlsMode: 'auto',
    ssoDetected: false,
    basicAuthDetected: false,
    compressionDetected: !!route.handle?.find(h => h.handler === 'encode'),
    websocketDetected: false,
    rateLimitDetected: false,
    sourceType: 'caddy',
    sourceIdentifier: route['@id'] ?? `caddy_route_${host}`,
    confidence: 'high',
    warnings: upstream ? [] : ['No reverse_proxy upstream found'],
    canAutoImport: !!upstream,
  }
}

export function parseCaddyConfig(config: CaddyConfig): ImportedRoute[] {
  const routes: ImportedRoute[] = []
  const servers = config.apps?.http?.servers ?? {}
  for (const srv of Object.values(servers)) {
    for (const route of srv.routes ?? []) {
      const r = caddyRouteToProxyOSRoute(route)
      if (r) routes.push(r)
    }
  }
  return routes
}
