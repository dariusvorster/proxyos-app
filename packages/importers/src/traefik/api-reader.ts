import type { ImportedRoute } from '../types'

export interface TraefikRouter {
  name: string
  rule: string
  service: string
  middlewares?: string[]
  tls?: { certResolver?: string }
  entryPoints?: string[]
}

export interface TraefikService {
  name: string
  loadBalancer?: {
    servers?: Array<{ url: string }>
  }
}

export async function fetchTraefikRouters(apiUrl: string): Promise<TraefikRouter[]> {
  const res = await fetch(`${apiUrl}/api/http/routers`)
  if (!res.ok) throw new Error(`Traefik API error: ${res.status}`)
  const data = await res.json() as TraefikRouter[]
  return data
}

export async function fetchTraefikServices(apiUrl: string): Promise<TraefikService[]> {
  const res = await fetch(`${apiUrl}/api/http/services`)
  if (!res.ok) throw new Error(`Traefik API error: ${res.status}`)
  const data = await res.json() as TraefikService[]
  return data
}

function extractDomainFromRule(rule: string): string | null {
  const m = rule.match(/Host\(`([^`]+)`\)/)
  return m ? (m[1] ?? null) : null
}

function extractUpstreamFromService(svc: TraefikService): string {
  const server = svc.loadBalancer?.servers?.[0]
  if (!server) return ''
  try {
    const url = new URL(server.url)
    return `${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`
  } catch {
    return server.url
  }
}

export function traefikRouterToProxyOSRoute(
  router: TraefikRouter,
  services: TraefikService[],
): ImportedRoute | null {
  const domain = extractDomainFromRule(router.rule)
  if (!domain) return null

  const svc = services.find(s => s.name === router.service)
  const upstream = svc ? extractUpstreamFromService(svc) : ''
  const hasTLS = !!router.tls

  const warnings: string[] = []
  if (!upstream) warnings.push(`Service "${router.service}" not found or has no upstream`)

  return {
    domain,
    upstream,
    protocol: 'http',
    tlsDetected: hasTLS,
    suggestedTlsMode: hasTLS ? 'auto' : 'off',
    ssoDetected: false,
    basicAuthDetected: false,
    compressionDetected: false,
    websocketDetected: false,
    rateLimitDetected: false,
    sourceType: 'traefik',
    sourceIdentifier: `traefik_router_${router.name}`,
    confidence: upstream ? 'high' : 'medium',
    warnings,
    canAutoImport: !!upstream,
  }
}
