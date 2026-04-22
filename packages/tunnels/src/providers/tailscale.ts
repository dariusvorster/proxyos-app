import { execFile } from 'child_process'
import { promisify } from 'util'
import type { TunnelProvider, TunnelRouteSpec, TunnelRouteResult, TunnelRouteState, TunnelHealth, TunnelProviderTestResult } from '../types'
import { TUNNEL_PORTS, DEFAULT_BACKOFF } from '../types'
import type { ProcessManager } from '../process-manager'

const execFileAsync = promisify(execFile)

export interface TailscaleFunnelCreds {
  authKey: string
  hostname?: string
  tags?: string[]
  loginServer?: string
}

// Tailscale Funnel ports and their internal Caddy port mappings
const FUNNEL_PORT_MAP: Record<number, number> = {
  443: TUNNEL_PORTS.tailscale[0],
  8443: TUNNEL_PORTS.tailscale[1],
  10000: TUNNEL_PORTS.tailscale[2],
}

interface AllocatedRoute {
  funnelPort: number
  internalPort: number
  routeRef: string
  publicUrl: string
}

const TS_SOCKET = '/var/run/tailscale/tailscaled.sock'

async function tsCmd(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('tailscale', [`--socket=${TS_SOCKET}`, ...args], { timeout: 10_000 })
    return stdout
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    throw new Error(`tailscale ${args[0]}: ${e.stderr ?? e.stdout ?? String(err)}`)
  }
}

export class TailscaleFunnelProvider implements TunnelProvider {
  readonly type = 'tailscale' as const

  private allocations = new Map<string, AllocatedRoute>()
  private hostname?: string

  constructor(
    readonly providerId: string,
    private readonly creds: TailscaleFunnelCreds,
  ) {}

  async test(): Promise<TunnelProviderTestResult> {
    try {
      await execFileAsync('tailscale', ['version'], { timeout: 5_000 })
      if (!this.creds.authKey) return { ok: false, error: 'Auth key is required' }
      return { ok: true }
    } catch {
      return { ok: false, error: 'tailscale binary not found — ensure Tailscale is installed in the container' }
    }
  }

  async start(pm: ProcessManager): Promise<void> {
    // Start tailscaled daemon
    pm.spawn({
      id: `ts-daemon-${this.providerId}`,
      command: 'tailscaled',
      args: ['--statedir=/var/lib/tailscale', '--tun=userspace-networking', `--socket=${TS_SOCKET}`],
      restartPolicy: 'always',
      backoff: DEFAULT_BACKOFF,
      logCircularBufferLines: 1000,
    })

    // Wait briefly for daemon to start, then authenticate
    await new Promise(r => setTimeout(r, 2_000))

    const loginArgs = [
      `--socket=${TS_SOCKET}`, 'up',
      `--authkey=${this.creds.authKey}`,
      `--hostname=${this.creds.hostname ?? `proxyos-${this.providerId.slice(0, 8)}`}`,
      '--advertise-tags=tag:funnel-enabled',
    ]
    if (this.creds.loginServer) loginArgs.push(`--login-server=${this.creds.loginServer}`)
    await execFileAsync('tailscale', loginArgs, { timeout: 30_000 })

    // Read assigned hostname
    const statusRaw = await tsCmd(['status', '--json'])
    const status = JSON.parse(statusRaw) as { Self?: { DNSName?: string } }
    this.hostname = status.Self?.DNSName?.replace(/\.$/, '')
  }

  async stop(): Promise<void> {
    try {
      await tsCmd(['down'])
    } catch {
      // Best effort
    }
  }

  async addRoute(spec: TunnelRouteSpec): Promise<TunnelRouteResult> {
    const funnelPort = this.allocateFunnelPort(spec.routeId)
    if (!funnelPort) {
      throw new Error(
        'Tailscale Funnel supports up to 3 routes per device (ports 443, 8443, 10000). ' +
        'All ports are in use. Remove an existing Funnel route or use Cloudflare Tunnel.',
      )
    }

    const internalPort = FUNNEL_PORT_MAP[funnelPort]!
    await tsCmd(['serve', '--bg', `--https=${funnelPort}`, `http://localhost:${internalPort}`])
    await tsCmd(['funnel', '--bg', String(funnelPort)])

    const hostname = this.hostname ?? `proxyos-${this.providerId.slice(0, 8)}.ts.net`
    const publicUrl = `https://${hostname}${funnelPort === 443 ? '' : `:${funnelPort}`}`
    const routeRef = `${spec.routeId}:${funnelPort}`

    this.allocations.set(spec.routeId, { funnelPort, internalPort, routeRef, publicUrl })

    return {
      publicUrl,
      routeRef,
      managedDnsRecord: true,
      meta: { funnelPort, internalPort },
    }
  }

  async removeRoute(routeRef: string): Promise<void> {
    const [, portStr] = routeRef.split(':')
    if (!portStr) return
    try {
      await tsCmd(['funnel', portStr, 'off'])
      await tsCmd(['serve', '--bg', `--https=${portStr}`, '--delete'])
    } catch {
      // Best effort on remove
    }
    for (const [routeId, alloc] of this.allocations) {
      if (alloc.routeRef === routeRef) {
        this.allocations.delete(routeId)
        break
      }
    }
  }

  async listRoutes(): Promise<TunnelRouteState[]> {
    return [...this.allocations.values()].map(a => ({
      routeRef: a.routeRef,
      publicUrl: a.publicUrl,
      status: 'active' as const,
    }))
  }

  async health(): Promise<TunnelHealth> {
    try {
      const statusRaw = await tsCmd(['status', '--json'])
      const status = JSON.parse(statusRaw) as { BackendState?: string; Self?: { Online?: boolean } }
      const online = status.Self?.Online ?? false
      return {
        status: online ? 'healthy' : 'degraded',
        details: { sidecarRunning: true },
      }
    } catch {
      return { status: 'stopped', details: { sidecarRunning: false } }
    }
  }

  getAclRequirement(): string {
    return JSON.stringify(
      { nodeAttrs: [{ target: ['tag:funnel-enabled'], attr: ['funnel'] }] },
      null,
      2,
    )
  }

  usedFunnelPorts(): number[] {
    return [...this.allocations.values()].map(a => a.funnelPort)
  }

  private allocateFunnelPort(routeId: string): number | null {
    const existing = this.allocations.get(routeId)
    if (existing) return existing.funnelPort
    for (const port of TUNNEL_PORTS.tailscaleFunnelPorts) {
      const inUse = [...this.allocations.values()].some(a => a.funnelPort === port)
      if (!inUse) return port
    }
    return null
  }
}
