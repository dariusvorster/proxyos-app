import type { TunnelProvider, TunnelRouteSpec, TunnelRouteResult, TunnelRouteState, TunnelHealth, TunnelProviderTestResult } from '../types'
import { TUNNEL_PORTS, DEFAULT_BACKOFF } from '../types'
import type { ProcessManager } from '../process-manager'

export interface CloudflareTunnelCreds {
  apiToken: string
  accountId: string
  tunnelName?: string
  tunnelId?: string
  tunnelToken?: string
  zoneId?: string
  originIp?: string
}

interface CfTunnel {
  id: string
  name: string
  status: string
  credentials_file?: { account_tag: string; tunnel_id: string; tunnel_secret: string }
}

interface CfIngressRule {
  hostname?: string
  service: string
}

async function cfFetch<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const base = 'https://api.cloudflare.com/client/v4'
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  })
  const body = await res.json() as { success: boolean; result: T; errors: { message: string }[] }
  if (!body.success) {
    throw new Error(`Cloudflare API error: ${body.errors.map(e => e.message).join(', ')}`)
  }
  return body.result
}

export class CloudflareTunnelProvider implements TunnelProvider {
  readonly type = 'cloudflare' as const

  private tunnelId?: string
  private tunnelToken?: string
  private ingress: CfIngressRule[] = []

  constructor(
    readonly providerId: string,
    private readonly creds: CloudflareTunnelCreds,
  ) {
    this.tunnelId = creds.tunnelId
    this.tunnelToken = creds.tunnelToken
  }

  async test(): Promise<TunnelProviderTestResult> {
    try {
      await cfFetch<{ id: string }>(this.creds.apiToken, `/accounts/${this.creds.accountId}`)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async start(pm: ProcessManager): Promise<void> {
    if (!this.tunnelId || !this.tunnelToken) {
      await this.ensureTunnel()
    }
    if (!this.tunnelToken) throw new Error('Cloudflare tunnel token not available')

    pm.spawn({
      id: `cf-${this.providerId}`,
      command: 'cloudflared',
      args: [
        'tunnel', '--no-autoupdate',
        '--metrics', '0.0.0.0:7842',
        'run', '--token', this.tunnelToken,
      ],
      restartPolicy: 'always',
      backoff: DEFAULT_BACKOFF,
      logCircularBufferLines: 1000,
      healthCheck: {
        type: 'http',
        endpoint: 'http://localhost:7842/ready',
        intervalMs: 15_000,
        timeoutMs: 5_000,
        healthyAfterChecks: 1,
        unhealthyAfterChecks: 3,
      },
    })
  }

  async stop(): Promise<void> {
    // Process manager handles shutdown via stopAll
  }

  async addRoute(spec: TunnelRouteSpec): Promise<TunnelRouteResult> {
    if (!this.tunnelId) throw new Error('Tunnel not initialized — call start() first')

    const hostname = spec.desiredHostname
    if (!hostname) throw new Error('Cloudflare tunnel requires desiredHostname')

    // Add ingress rule
    this.ingress = this.ingress.filter(r => r.hostname !== hostname)
    this.ingress.push({ hostname, service: `http://localhost:${TUNNEL_PORTS.cloudflare}` })
    await this.pushIngress()

    // Create DNS CNAME if zone configured
    if (this.creds.zoneId) {
      try {
        await cfFetch(this.creds.apiToken, `/zones/${this.creds.zoneId}/dns_records`, {
          method: 'POST',
          body: JSON.stringify({
            type: 'CNAME',
            name: hostname,
            content: `${this.tunnelId}.cfargotunnel.com`,
            proxied: true,
            ttl: 1,
          }),
        })
      } catch {
        // DNS record may already exist; non-fatal
      }
    }

    return {
      publicUrl: `https://${hostname}`,
      routeRef: hostname,
      managedDnsRecord: !!this.creds.zoneId,
      meta: { tunnelId: this.tunnelId },
    }
  }

  async removeRoute(routeRef: string): Promise<void> {
    this.ingress = this.ingress.filter(r => r.hostname !== routeRef)
    await this.pushIngress()
  }

  async listRoutes(): Promise<TunnelRouteState[]> {
    return this.ingress
      .filter(r => r.hostname)
      .map(r => ({ routeRef: r.hostname!, publicUrl: `https://${r.hostname}`, status: 'active' as const }))
  }

  async health(): Promise<TunnelHealth> {
    try {
      const res = await fetch('http://localhost:7842/ready', { signal: AbortSignal.timeout(3_000) })
      const metrics = await fetch('http://localhost:7842/metrics', { signal: AbortSignal.timeout(3_000) })
      const text = await metrics.text()
      const connMatch = text.match(/cloudflared_tunnel_active_streams\{.*?\}\s+(\d+)/)
      const connCount = connMatch ? parseInt(connMatch[1]!, 10) : undefined

      return {
        status: res.ok ? 'healthy' : 'degraded',
        details: {
          sidecarRunning: true,
          connectorsConnected: connCount,
        },
      }
    } catch {
      return {
        status: 'stopped',
        details: { sidecarRunning: false },
      }
    }
  }

  private async ensureTunnel(): Promise<void> {
    const tunnelName = this.creds.tunnelName ?? `proxyos-${this.providerId.slice(0, 8)}`

    const tunnels = await cfFetch<CfTunnel[]>(
      this.creds.apiToken,
      `/accounts/${this.creds.accountId}/cfd_tunnel?name=${encodeURIComponent(tunnelName)}`,
    )

    if (tunnels.length > 0 && tunnels[0]) {
      this.tunnelId = tunnels[0].id
    } else {
      const secret = crypto.randomUUID().replace(/-/g, '')
      const created = await cfFetch<CfTunnel>(
        this.creds.apiToken,
        `/accounts/${this.creds.accountId}/cfd_tunnel`,
        { method: 'POST', body: JSON.stringify({ name: tunnelName, tunnel_secret: btoa(secret) }) },
      )
      this.tunnelId = created.id
    }

    // Fetch token
    const token = await cfFetch<string>(
      this.creds.apiToken,
      `/accounts/${this.creds.accountId}/cfd_tunnel/${this.tunnelId}/token`,
    )
    this.tunnelToken = token
  }

  private async pushIngress(): Promise<void> {
    if (!this.tunnelId) return
    const rules: CfIngressRule[] = [
      ...this.ingress,
      { service: 'http_status:404' }, // catch-all required by CF
    ]
    await cfFetch(
      this.creds.apiToken,
      `/accounts/${this.creds.accountId}/cfd_tunnel/${this.tunnelId}/configurations`,
      { method: 'PUT', body: JSON.stringify({ config: { ingress: rules } }) },
    )
  }

  getTunnelId(): string | undefined { return this.tunnelId }
  getTunnelToken(): string | undefined { return this.tunnelToken }
}
