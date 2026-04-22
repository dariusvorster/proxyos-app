import type { TunnelProvider, TunnelRouteSpec, TunnelRouteResult, TunnelRouteState, TunnelHealth, TunnelProviderTestResult } from '../types'
import { TUNNEL_PORTS, DEFAULT_BACKOFF } from '../types'
import type { ProcessManager } from '../process-manager'

export interface NgrokCreds {
  authToken: string
  region?: string
  reservedDomains?: string[]
}

interface NgrokTunnel {
  name: string
  public_url: string
  proto: string
  config: { addr: string }
  status: string
}

const NGROK_API_BASE = 'http://localhost:4040/api'

async function ngrokLocal<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${NGROK_API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`ngrok agent API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

interface NgrokApiTunnel { tunnels: NgrokTunnel[] }

export class NgrokProvider implements TunnelProvider {
  readonly type = 'ngrok' as const

  private activeRoutes = new Map<string, { name: string; publicUrl: string }>()
  private reservedDomainIndex = 0

  constructor(
    readonly providerId: string,
    private readonly creds: NgrokCreds,
  ) {}

  async test(): Promise<TunnelProviderTestResult> {
    try {
      const res = await fetch('https://api.ngrok.com/endpoints', {
        headers: { Authorization: `Bearer ${this.creds.authToken}`, 'Ngrok-Version': '2' },
        signal: AbortSignal.timeout(8_000),
      })
      if (res.status === 401) return { ok: false, error: 'Invalid ngrok auth token' }
      if (!res.ok) return { ok: false, error: `ngrok API returned ${res.status}` }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async start(pm: ProcessManager): Promise<void> {
    pm.spawn({
      id: `ngrok-${this.providerId}`,
      command: 'ngrok',
      args: [
        'start', '--none',
        `--authtoken=${this.creds.authToken}`,
        `--region=${this.creds.region ?? 'us'}`,
      ],
      restartPolicy: 'always',
      backoff: DEFAULT_BACKOFF,
      logCircularBufferLines: 1000,
      healthCheck: {
        type: 'http',
        endpoint: 'http://localhost:4040/api/tunnels',
        intervalMs: 15_000,
        timeoutMs: 5_000,
        healthyAfterChecks: 1,
        unhealthyAfterChecks: 3,
      },
    })

    // Wait for agent to be ready
    let attempts = 0
    while (attempts < 20) {
      try {
        await ngrokLocal('/tunnels')
        break
      } catch {
        await new Promise(r => setTimeout(r, 1_000))
        attempts++
      }
    }
  }

  async stop(): Promise<void> {
    for (const name of this.activeRoutes.keys()) {
      try {
        await ngrokLocal(`/tunnels/${name}`, { method: 'DELETE' })
      } catch {
        // Best effort
      }
    }
    this.activeRoutes.clear()
  }

  async addRoute(spec: TunnelRouteSpec): Promise<TunnelRouteResult> {
    const tunnelName = `proxyos-route-${spec.routeId.slice(0, 12)}`
    const hostname = this.pickHostname()

    const body: Record<string, unknown> = {
      name: tunnelName,
      proto: 'http',
      addr: TUNNEL_PORTS.ngrok,
    }
    if (hostname) {
      body.hostname = hostname
      body.host_header = hostname
    }

    const tunnel = await ngrokLocal<NgrokTunnel>('/tunnels', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    this.activeRoutes.set(spec.routeId, { name: tunnelName, publicUrl: tunnel.public_url })

    return {
      publicUrl: tunnel.public_url,
      routeRef: tunnelName,
      managedDnsRecord: false,
      meta: { tunnelName, hostname: hostname ?? 'auto-assigned' },
    }
  }

  async removeRoute(routeRef: string): Promise<void> {
    try {
      await ngrokLocal(`/tunnels/${routeRef}`, { method: 'DELETE' })
    } catch {
      // Best effort
    }
    for (const [routeId, info] of this.activeRoutes) {
      if (info.name === routeRef) {
        this.activeRoutes.delete(routeId)
        break
      }
    }
  }

  async listRoutes(): Promise<TunnelRouteState[]> {
    try {
      const data = await ngrokLocal<NgrokApiTunnel>('/tunnels')
      return data.tunnels.map(t => ({
        routeRef: t.name,
        publicUrl: t.public_url,
        status: t.status === 'started' ? 'active' as const : 'inactive' as const,
      }))
    } catch {
      return []
    }
  }

  async health(): Promise<TunnelHealth> {
    try {
      await ngrokLocal('/tunnels')
      return { status: 'healthy', details: { sidecarRunning: true } }
    } catch {
      return { status: 'stopped', details: { sidecarRunning: false } }
    }
  }

  private pickHostname(): string | undefined {
    const domains = this.creds.reservedDomains ?? []
    if (domains.length === 0) return undefined
    const domain = domains[this.reservedDomainIndex % domains.length]
    this.reservedDomainIndex++
    return domain
  }
}
