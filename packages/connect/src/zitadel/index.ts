import type { ConnectionAdapter, ConnectionTestResult, ChainNode, RouteConfig } from '../types'

export interface ZitadelCreds {
  url: string              // e.g. https://zitadel.example.com
  token: string            // Personal access token (PAT)
  projectId?: string       // Zitadel project ID to create apps in
}

interface ZitadelApp {
  appId: string
  name: string
  state: string
}

async function zdFetch<T>(creds: ZitadelCreds, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${creds.url.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Zitadel API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export class ZitadelAdapter implements ConnectionAdapter {
  readonly type = 'zitadel' as const

  constructor(
    readonly connectionId: string,
    private readonly creds: ZitadelCreds,
  ) {}

  async test(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      await zdFetch<unknown>(this.creds, '/auth/v1/users/me')
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(): Promise<void> {
    await zdFetch<unknown>(this.creds, '/auth/v1/users/me')
  }

  async listApps(): Promise<ZitadelApp[]> {
    if (!this.creds.projectId) return []
    const res = await zdFetch<{ result?: ZitadelApp[] }>(
      this.creds, `/management/v1/projects/${this.creds.projectId}/apps/_search`,
      { method: 'POST', body: JSON.stringify({ query: { limit: 100 } }) },
    )
    return res.result ?? []
  }

  async findApp(domain: string): Promise<ZitadelApp | null> {
    const apps = await this.listApps()
    return apps.find(a => a.name === `proxyos-${domain.replace(/\./g, '-')}`) ?? null
  }

  async onRouteCreated(route: RouteConfig): Promise<void> {
    if (!route.ssoEnabled || !this.creds.projectId) return
    const name = `proxyos-${route.domain.replace(/\./g, '-')}`
    const existing = await this.findApp(route.domain)
    if (existing) return

    await zdFetch<unknown>(
      this.creds,
      `/management/v1/projects/${this.creds.projectId}/apps/oidc`,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          redirectUris: [`https://${route.domain}/callback`],
          responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
          grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
          appType: 'OIDC_APP_TYPE_WEB',
          authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC',
          postLogoutRedirectUris: [`https://${route.domain}`],
          devMode: false,
        }),
      },
    )
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
      const app = await this.findApp(domain)
      return [{
        id: `${routeId}_sso`,
        routeId,
        nodeType: 'sso',
        label: 'Zitadel',
        status: app ? 'ok' : 'warning',
        detail: app ? `App: ${app.name} (${app.state})` : 'No Zitadel app found',
        warning: app ? undefined : 'Run auto-configure to create the app',
        provider: 'zitadel',
        lastCheck: new Date(),
      }]
    } catch (err) {
      return [{
        id: `${routeId}_sso`,
        routeId,
        nodeType: 'sso',
        label: 'Zitadel',
        status: 'error',
        detail: err instanceof Error ? err.message : 'Zitadel check failed',
        provider: 'zitadel',
        lastCheck: new Date(),
      }]
    }
  }
}
