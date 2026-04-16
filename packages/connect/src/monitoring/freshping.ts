import type { ConnectionAdapter, ConnectionTestResult, ChainNode, RouteConfig } from '../types'

export interface FreshpingCreds {
  apiKey: string
}

const FP_BASE = 'https://api.freshping.io/v1'

interface FpCheck {
  id: number
  check_name: string
  request_url: string
  paused: boolean
  check_status: 'available' | 'unavailable' | 'unknown' | 'paused'
}

async function fpFetch<T>(apiKey: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${FP_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Freshping ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export class FreshpingAdapter implements ConnectionAdapter {
  readonly type = 'freshping' as const

  constructor(
    readonly connectionId: string,
    private readonly creds: FreshpingCreds,
  ) {}

  async test(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      await fpFetch<unknown>(this.creds.apiKey, '/checks/?limit=1')
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(): Promise<void> {
    await fpFetch<unknown>(this.creds.apiKey, '/checks/?limit=1')
  }

  async listChecks(): Promise<FpCheck[]> {
    const res = await fpFetch<{ results: FpCheck[] }>(this.creds.apiKey, '/checks/?limit=200')
    return res.results ?? []
  }

  async findCheckForUrl(url: string): Promise<FpCheck | null> {
    const checks = await this.listChecks()
    return checks.find(c => c.request_url === url) ?? null
  }

  async createCheck(name: string, url: string): Promise<number> {
    const res = await fpFetch<FpCheck>(this.creds.apiKey, '/checks/', {
      method: 'POST',
      body: JSON.stringify({
        check_name: name,
        request_url: url,
        check_type: 'API',
        check_period: 1,
        paused: false,
      }),
    })
    return res.id
  }

  async pauseCheck(id: number): Promise<void> {
    await fpFetch<unknown>(this.creds.apiKey, `/checks/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ paused: true }),
    })
  }

  async deleteCheck(id: number): Promise<void> {
    await fpFetch<unknown>(this.creds.apiKey, `/checks/${id}/`, { method: 'DELETE' })
  }

  async getCheckStatus(id: number): Promise<FpCheck['check_status'] | 'unknown'> {
    try {
      const check = await fpFetch<FpCheck>(this.creds.apiKey, `/checks/${id}/`)
      return check.check_status
    } catch {
      return 'unknown'
    }
  }

  async onRouteCreated(route: RouteConfig): Promise<void> {
    const url = `https://${route.domain}`
    const existing = await this.findCheckForUrl(url).catch(() => null)
    if (!existing) await this.createCheck(route.domain, url)
  }

  async onRouteUpdated(route: RouteConfig): Promise<void> {
    await this.onRouteCreated(route)
  }

  async onRouteDeleted(routeId: string): Promise<void> { void routeId }

  async getChainNodes(routeId: string): Promise<ChainNode[]> { void routeId; return [] }

  async getChainNodesForMonitor(routeId: string, monitorId: number): Promise<ChainNode[]> {
    try {
      const status = await this.getCheckStatus(monitorId)
      return [{
        id: `${routeId}_monitor`,
        routeId,
        nodeType: 'upstream',
        label: 'Freshping',
        status: status === 'available' ? 'ok' : status === 'unavailable' ? 'error' : 'warning',
        detail: `Check ${monitorId} · ${status}`,
        provider: 'freshping',
        lastCheck: new Date(),
      }]
    } catch {
      return []
    }
  }
}
