/**
 * ProxyOS → InfraOS integration adapter
 *
 * Conforms to the IntegrationAdapter interface defined in:
 *   packages/integrations/types.ts  (InfraOS monorepo)
 *
 * Drop this file into:
 *   infraos/packages/integrations/proxyos.ts
 *
 * Register it in the InfraOS integrations registry alongside the
 * Proxmox, Cloudflare, Authentik, and Docker adapters.
 */

// ── Types copied from InfraOS packages/integrations/types.ts ─────────────────
// Remove this block once the file lives inside the InfraOS monorepo and can
// import directly from the shared types package.

export interface IntegrationAdapter {
  id: string
  test(): Promise<{ ok: boolean; message?: string }>
  sync(): Promise<SyncResult>
}

export interface SyncResult {
  nodes?: NodeData[]
  services?: ServiceData[]
  tunnelRoutes?: TunnelRouteData[]
  ssoProviders?: SSOProviderData[]
  dnsRecords?: DNSRecordData[]
}

export interface NodeData {
  id: string
  integrationId: string
  name: string
  type: 'vm' | 'lxc' | 'container' | 'host'
  ip?: string
  port?: number
  status: 'running' | 'stopped' | 'paused'
  meta?: Record<string, unknown>
}

export interface ServiceData {
  id: string
  name: string
  nodeId?: string
  port?: number
  protocol?: string
  internalUrl?: string
  status?: string
  meta?: Record<string, unknown>
}

export interface TunnelRouteData {
  id: string
  integrationId: string
  domain: string
  serviceId?: string
  targetUrl?: string
  status?: string
  meta?: Record<string, unknown>
}

export interface SSOProviderData {
  id: string
  integrationId: string
  name: string
  type: string
  serviceId?: string
  meta?: Record<string, unknown>
}

// dnsRecords not surfaced by ProxyOS — left for CF/Route53 adapters
export interface DNSRecordData {
  id: string
  integrationId: string
  zone: string
  name: string
  type: string
  value: string
  proxied?: boolean
}

// ── ProxyOS API response shapes ───────────────────────────────────────────────

interface ProxyOSRoute {
  id: string
  name: string
  domain: string
  enabled: boolean
  upstreams: Array<{ address: string; weight: number }>
  lbPolicy: string
  tlsMode: string
  ssoEnabled: boolean
  healthCheckEnabled: boolean
  healthCheckPath: string
  healthCheckInterval: number
  createdAt: string
  updatedAt: string
}

interface ProxyOSCert {
  id: string
  domain: string
  status: string
  source: string
  issuedAt: string | null
  expiresAt: string | null
  autoRenew: boolean
  routeId: string | null
}

interface ProxyOSAnalytics {
  routeId: string
  requests: number
  errors: number
  status5xx: number
  avgLatencyMs: number
  errorRatePct: number
}

interface ProxyOSHealth {
  ok: boolean
  version: string
  routeCount: number
  certCount: number
}

// ── tRPC JSON response wrapper ────────────────────────────────────────────────

interface TRPCResponse<T> {
  result: { data: { json: T } }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface ProxyOSAdapterConfig {
  /** Base URL of your ProxyOS instance, e.g. https://proxy.home.lab */
  baseUrl: string
  /** API token with scopes: health:read, routes:read, certs:read, analytics:read */
  apiToken: string
  /** Analytics window in minutes (default: 60) */
  analyticsWindowMinutes?: number
}

export class ProxyOSAdapter implements IntegrationAdapter {
  readonly id = 'proxyos'
  private readonly baseUrl: string
  private readonly apiToken: string
  private readonly analyticsWindow: number

  constructor(config: ProxyOSAdapterConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiToken = config.apiToken
    this.analyticsWindow = config.analyticsWindowMinutes ?? 60
  }

  // ── Internal fetch helper ─────────────────────────────────────────────────

  private async trpcQuery<T>(procedure: string, input?: unknown): Promise<T> {
    const inputParam = input !== undefined
      ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
      : ''
    const url = `${this.baseUrl}/api/trpc/${procedure}${inputParam}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`ProxyOS API error ${res.status}: ${body}`)
    }
    const json = (await res.json()) as TRPCResponse<T>
    return json.result.data.json
  }

  // ── IntegrationAdapter interface ──────────────────────────────────────────

  async test(): Promise<{ ok: boolean; message?: string }> {
    try {
      const health = await this.trpcQuery<ProxyOSHealth>('publicApi.health')
      return {
        ok: health.ok,
        message: `ProxyOS v${health.version} — ${health.routeCount} routes, ${health.certCount} certs`,
      }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  }

  async sync(): Promise<SyncResult> {
    const [proxyRoutes, proxyCerts, analytics] = await Promise.all([
      this.trpcQuery<ProxyOSRoute[]>('publicApi.routes'),
      this.trpcQuery<ProxyOSCert[]>('publicApi.certs'),
      this.trpcQuery<ProxyOSAnalytics[]>('publicApi.analytics', { windowMinutes: this.analyticsWindow }),
    ])

    const analyticsMap = new Map(analytics.map(a => [a.routeId, a]))

    // Each ProxyOS route maps to an InfraOS service.
    // The first upstream address is used to infer nodeId/port.
    const services: ServiceData[] = proxyRoutes.map(route => {
      const firstUpstream = route.upstreams[0]?.address ?? ''
      const stats = analyticsMap.get(route.id)
      return {
        id: `proxyos:${route.id}`,
        name: route.name,
        port: extractPort(firstUpstream),
        protocol: route.tlsMode === 'off' ? 'http' : 'https',
        internalUrl: firstUpstream || undefined,
        status: route.enabled ? 'running' : 'stopped',
        meta: {
          domain: route.domain,
          tlsMode: route.tlsMode,
          lbPolicy: route.lbPolicy,
          upstreams: route.upstreams,
          ssoEnabled: route.ssoEnabled,
          healthCheckPath: route.healthCheckPath,
          certStatus: proxyCerts.find(c => c.routeId === route.id)?.status ?? null,
          certExpiresAt: proxyCerts.find(c => c.routeId === route.id)?.expiresAt ?? null,
          ...(stats && {
            requests1h: stats.requests,
            errors1h: stats.errors,
            avgLatencyMs: stats.avgLatencyMs,
            errorRatePct: stats.errorRatePct,
          }),
        },
      }
    })

    // Each active ProxyOS route with a domain maps to an InfraOS tunnel route.
    // (Represents the fact that ProxyOS/Caddy is the ingress for that domain.)
    const tunnelRoutes: TunnelRouteData[] = proxyRoutes
      .filter(r => r.enabled)
      .map(route => ({
        id: `proxyos:tunnel:${route.id}`,
        integrationId: this.id,
        domain: route.domain,
        serviceId: `proxyos:${route.id}`,
        targetUrl: route.upstreams[0]?.address,
        status: 'active',
        meta: { source: 'caddy', tlsMode: route.tlsMode },
      }))

    // SSO-enabled routes surface as SSO providers in InfraOS topology.
    const ssoProviders: SSOProviderData[] = proxyRoutes
      .filter(r => r.ssoEnabled)
      .map(route => ({
        id: `proxyos:sso:${route.id}`,
        integrationId: this.id,
        name: `${route.name} (forward-auth)`,
        type: 'proxy',
        serviceId: `proxyos:${route.id}`,
        meta: { domain: route.domain },
      }))

    return { services, tunnelRoutes, ssoProviders }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPort(address: string): number | undefined {
  try {
    const url = new URL(address)
    if (url.port) return parseInt(url.port, 10)
    return url.protocol === 'https:' ? 443 : 80
  } catch {
    return undefined
  }
}
