import type { ConnectionAdapter, ConnectionTestResult, ChainNode, RouteConfig } from '../types'

export interface BetterstackCreds {
  apiToken: string
}

const BS_BASE = 'https://uptime.betterstack.com/api/v2'

interface BsMonitorAttributes {
  url: string
  pronounceable_name: string
  status: 'up' | 'down' | 'paused' | 'pending' | 'maintenance'
  check_frequency: number
}

interface BsMonitor {
  id: string
  type: string
  attributes: BsMonitorAttributes
}

async function bsFetch<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BS_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Betterstack ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export class BetterstackAdapter implements ConnectionAdapter {
  readonly type = 'betterstack' as const

  constructor(
    readonly connectionId: string,
    private readonly creds: BetterstackCreds,
  ) {}

  async test(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      await bsFetch<unknown>(this.creds.apiToken, '/monitors?per_page=1')
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(): Promise<void> {
    await bsFetch<unknown>(this.creds.apiToken, '/monitors?per_page=1')
  }

  async listMonitors(): Promise<BsMonitor[]> {
    const res = await bsFetch<{ data: BsMonitor[] }>(this.creds.apiToken, '/monitors?per_page=250')
    return res.data ?? []
  }

  async findMonitorForUrl(url: string): Promise<BsMonitor | null> {
    const monitors = await this.listMonitors()
    return monitors.find(m => m.attributes.url === url) ?? null
  }

  async createMonitor(name: string, url: string): Promise<string> {
    const res = await bsFetch<{ data: BsMonitor }>(this.creds.apiToken, '/monitors', {
      method: 'POST',
      body: JSON.stringify({
        monitor_type: 'status',
        url,
        pronounceable_name: name,
        check_frequency: 180,
      }),
    })
    return res.data.id
  }

  async pauseMonitor(id: string): Promise<void> {
    await bsFetch<unknown>(this.creds.apiToken, `/monitors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ paused: true }),
    })
  }

  async deleteMonitor(id: string): Promise<void> {
    await bsFetch<unknown>(this.creds.apiToken, `/monitors/${id}`, { method: 'DELETE' })
  }

  async getMonitorStatus(id: string): Promise<BsMonitorAttributes['status'] | 'unknown'> {
    try {
      const res = await bsFetch<{ data: BsMonitor }>(this.creds.apiToken, `/monitors/${id}`)
      return res.data.attributes.status
    } catch {
      return 'unknown'
    }
  }

  async onRouteCreated(route: RouteConfig): Promise<void> {
    const url = `https://${route.domain}`
    const existing = await this.findMonitorForUrl(url).catch(() => null)
    if (!existing) await this.createMonitor(route.domain, url)
  }

  async onRouteUpdated(route: RouteConfig): Promise<void> {
    await this.onRouteCreated(route)
  }

  async onRouteDeleted(routeId: string): Promise<void> { void routeId }

  async getChainNodes(routeId: string): Promise<ChainNode[]> { void routeId; return [] }

  async getChainNodesForMonitor(routeId: string, monitorId: string): Promise<ChainNode[]> {
    try {
      const status = await this.getMonitorStatus(monitorId)
      return [{
        id: `${routeId}_monitor`,
        routeId,
        nodeType: 'upstream',
        label: 'Betterstack',
        status: status === 'up' ? 'ok' : status === 'down' ? 'error' : 'warning',
        detail: `Monitor ${monitorId} · ${status}`,
        provider: 'betterstack',
        lastCheck: new Date(),
      }]
    } catch {
      return []
    }
  }
}
