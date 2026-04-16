import type { ConnectionAdapter, ConnectionTestResult, ChainNode, RouteConfig } from '../types'

export interface AuthentikCreds {
  url: string       // e.g. https://auth.example.com
  token: string     // API token
}

interface AkApp {
  pk: string
  name: string
  slug: string
  provider: number | null
  meta_launch_url: string
}

interface AkProxyProvider {
  pk: number
  name: string
  external_host: string
  mode: string
}

interface AkOutpost {
  pk: string
  name: string
  type: string
  managed_applications: string[]
}

async function akFetch<T>(url: string, token: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${url.replace(/\/$/, '')}/api/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Authentik API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export class AuthentikAdapter implements ConnectionAdapter {
  readonly type = 'authentik' as const

  constructor(
    readonly connectionId: string,
    private readonly creds: AuthentikCreds,
  ) {}

  async test(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      await akFetch<{ pk: number }>(this.creds.url, this.creds.token, '/core/users/me/')
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(): Promise<void> {
    await akFetch<unknown>(this.creds.url, this.creds.token, '/core/applications/?page_size=1')
  }

  async listApplications(): Promise<AkApp[]> {
    const res = await akFetch<{ results: AkApp[] }>(this.creds.url, this.creds.token, '/core/applications/')
    return res.results
  }

  async findApplicationForDomain(domain: string): Promise<AkApp | null> {
    const apps = await this.listApplications()
    return apps.find(a => a.slug === domain.replace(/\./g, '-') || a.meta_launch_url?.includes(domain)) ?? null
  }

  async onRouteCreated(route: RouteConfig): Promise<void> {
    if (!route.ssoEnabled) return

    const slug = route.domain.replace(/\./g, '-')
    const externalHost = `https://${route.domain}`

    // 1. Create proxy provider (forward auth, single application mode)
    const provider = await akFetch<AkProxyProvider>(
      this.creds.url, this.creds.token, '/providers/proxy/',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `proxyos-${slug}`,
          external_host: externalHost,
          mode: 'forward_single',
          authorization_flow: null,
        }),
      },
    ).catch(async () => {
      // Try to find existing provider
      const res = await akFetch<{ results: AkProxyProvider[] }>(
        this.creds.url, this.creds.token, `/providers/proxy/?external_host=${encodeURIComponent(externalHost)}`,
      )
      return res.results[0] ?? null
    })

    if (!provider) return

    // 2. Create application linked to provider
    await akFetch<AkApp>(this.creds.url, this.creds.token, '/core/applications/', {
      method: 'POST',
      body: JSON.stringify({
        name: `proxyos-${slug}`,
        slug,
        provider: provider.pk,
        meta_launch_url: externalHost,
      }),
    }).catch(() => { /* Application may already exist */ })

    // 3. Add to embedded outpost
    try {
      const outpostRes = await akFetch<{ results: AkOutpost[] }>(
        this.creds.url, this.creds.token, '/outposts/instances/?type=proxy',
      )
      const outpost = outpostRes.results[0]
      if (outpost) {
        const updated = [...new Set([...outpost.managed_applications, slug])]
        await akFetch<unknown>(this.creds.url, this.creds.token, `/outposts/instances/${outpost.pk}/`, {
          method: 'PATCH',
          body: JSON.stringify({ managed_applications: updated }),
        })
      }
    } catch { /* Outpost binding is best-effort */ }
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
      const app = await this.findApplicationForDomain(domain)
      return [{
        id: `${routeId}_sso`,
        routeId,
        nodeType: 'sso',
        label: 'Authentik',
        status: app ? 'ok' : 'warning',
        detail: app ? `App: ${app.name}` : 'No Authentik app found for this domain',
        warning: app ? undefined : 'Run auto-configure to create the app',
        provider: 'authentik',
        lastCheck: new Date(),
      }]
    } catch (err) {
      return [{
        id: `${routeId}_sso`,
        routeId,
        nodeType: 'sso',
        label: 'Authentik',
        status: 'error',
        detail: err instanceof Error ? err.message : 'Authentik check failed',
        provider: 'authentik',
        lastCheck: new Date(),
      }]
    }
  }
}
