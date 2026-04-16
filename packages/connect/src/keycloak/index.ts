import type { ConnectionAdapter, ConnectionTestResult, ChainNode, RouteConfig } from '../types'

export interface KeycloakCreds {
  url: string           // e.g. https://keycloak.example.com
  realm: string
  clientId: string      // admin client
  clientSecret: string  // admin client secret
}

interface KcClient {
  id: string
  clientId: string
  rootUrl: string
  enabled: boolean
  redirectUris: string[]
}

async function kcAdminToken(creds: KeycloakCreds): Promise<string> {
  const res = await fetch(
    `${creds.url.replace(/\/$/, '')}/realms/${creds.realm}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
    },
  )
  if (!res.ok) throw new Error(`Keycloak auth failed: ${res.status}`)
  const json = await res.json() as { access_token: string }
  return json.access_token
}

async function kcFetch<T>(creds: KeycloakCreds, path: string, options?: RequestInit): Promise<T> {
  const token = await kcAdminToken(creds)
  const res = await fetch(`${creds.url.replace(/\/$/, '')}/admin/realms/${creds.realm}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Keycloak API ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export class KeycloakAdapter implements ConnectionAdapter {
  readonly type = 'keycloak' as const

  constructor(
    readonly connectionId: string,
    private readonly creds: KeycloakCreds,
  ) {}

  async test(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      await kcAdminToken(this.creds)
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(): Promise<void> {
    await kcFetch<KcClient[]>(this.creds, '/clients?max=1')
  }

  async findClient(domain: string): Promise<KcClient | null> {
    const clients = await kcFetch<KcClient[]>(
      this.creds, `/clients?clientId=${encodeURIComponent(domain)}&max=1`,
    )
    return clients[0] ?? null
  }

  async onRouteCreated(route: RouteConfig): Promise<void> {
    if (!route.ssoEnabled) return
    const existing = await this.findClient(route.domain)
    if (existing) return

    await kcFetch<void>(this.creds, '/clients', {
      method: 'POST',
      body: JSON.stringify({
        clientId: route.domain,
        name: route.domain,
        enabled: true,
        protocol: 'openid-connect',
        publicClient: false,
        standardFlowEnabled: true,
        rootUrl: `https://${route.domain}`,
        redirectUris: [`https://${route.domain}/*`],
        webOrigins: ['+'],
        attributes: { 'proxyos.managed': 'true' },
      }),
    })
  }

  async onRouteUpdated(route: RouteConfig): Promise<void> {
    await this.onRouteCreated(route)
  }

  async onRouteDeleted(routeId: string): Promise<void> {
    void routeId
  }

  async getChainNodes(routeId: string): Promise<ChainNode[]> {
    void routeId
    return []
  }

  async getChainNodesForDomain(routeId: string, domain: string): Promise<ChainNode[]> {
    try {
      const client = await this.findClient(domain)
      return [{
        id: `${routeId}_sso`,
        routeId,
        nodeType: 'sso',
        label: 'Keycloak',
        status: client ? 'ok' : 'warning',
        detail: client ? `Client: ${client.clientId}` : 'No Keycloak client found',
        warning: client ? undefined : 'Run auto-configure to create the client',
        provider: 'keycloak',
        lastCheck: new Date(),
      }]
    } catch (err) {
      return [{
        id: `${routeId}_sso`,
        routeId,
        nodeType: 'sso',
        label: 'Keycloak',
        status: 'error',
        detail: err instanceof Error ? err.message : 'Keycloak check failed',
        provider: 'keycloak',
        lastCheck: new Date(),
      }]
    }
  }
}
