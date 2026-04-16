import type { ConnectionAdapter, ConnectionTestResult, ChainNode, RouteConfig } from '../types'

export interface UptimeKumaCreds {
  url: string
  username: string
  password: string
}

interface UkMonitor {
  id: number
  name: string
  url: string
  type: string
  active: boolean
  heartbeatList?: { status: number; time: string }[]
}

interface UkLoginResponse {
  token?: string
  tokenRequired?: boolean
}

async function ukLogin(creds: UptimeKumaCreds): Promise<string> {
  const base = creds.url.replace(/\/$/, '')
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: creds.username, password: creds.password }),
  })
  if (!res.ok) throw new Error(`Uptime Kuma login failed: ${res.status}`)
  const json = (await res.json()) as UkLoginResponse
  if (!json.token) throw new Error('Login succeeded but no token returned')
  return json.token
}

async function ukFetch<T>(creds: UptimeKumaCreds, path: string, options?: RequestInit): Promise<T> {
  const token = await ukLogin(creds)
  const res = await fetch(`${creds.url.replace(/\/$/, '')}/api${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Uptime Kuma ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export class UptimeKumaAdapter implements ConnectionAdapter {
  readonly type = 'uptime_kuma' as const

  constructor(
    readonly connectionId: string,
    private readonly creds: UptimeKumaCreds,
  ) {}

  async test(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      await ukLogin(this.creds)
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async sync(): Promise<void> {
    await ukFetch<unknown>(this.creds, '/monitors')
  }

  async listMonitors(): Promise<UkMonitor[]> {
    const res = await ukFetch<{ monitors: UkMonitor[] }>(this.creds, '/monitors')
    return res.monitors ?? []
  }

  async findMonitorForUrl(url: string): Promise<UkMonitor | null> {
    const monitors = await this.listMonitors()
    return monitors.find(m => m.url === url) ?? null
  }

  async createMonitor(name: string, url: string): Promise<number> {
    const res = await ukFetch<{ monitorID: number }>(this.creds, '/monitors', {
      method: 'POST',
      body: JSON.stringify({
        type: 'http',
        name,
        url,
        interval: 60,
        retryInterval: 60,
        maxretries: 1,
        active: true,
      }),
    })
    return res.monitorID
  }

  async pauseMonitor(id: number): Promise<void> {
    await ukFetch<unknown>(this.creds, `/monitors/${id}/pause`, { method: 'POST' })
  }

  async deleteMonitor(id: number): Promise<void> {
    await ukFetch<unknown>(this.creds, `/monitors/${id}`, { method: 'DELETE' })
  }

  async getMonitorStatus(id: number): Promise<'up' | 'down' | 'pending' | 'unknown'> {
    const monitors = await this.listMonitors()
    const m = monitors.find(x => x.id === id)
    if (!m) return 'unknown'
    const last = m.heartbeatList?.[0]?.status
    if (last === 1) return 'up'
    if (last === 0) return 'down'
    return 'pending'
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

  async getChainNodesForMonitor(routeId: string, monitorId: number): Promise<ChainNode[]> {
    try {
      const status = await this.getMonitorStatus(monitorId)
      return [{
        id: `${routeId}_monitor`,
        routeId,
        nodeType: 'upstream',
        label: 'Uptime Kuma',
        status: status === 'up' ? 'ok' : status === 'down' ? 'error' : 'warning',
        detail: `Monitor ${monitorId} · ${status}`,
        provider: 'uptime_kuma',
        lastCheck: new Date(),
      }]
    } catch {
      return []
    }
  }
}
