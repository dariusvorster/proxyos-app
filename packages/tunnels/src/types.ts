import type { ProcessManager } from './process-manager'

export type TunnelProviderType = 'cloudflare' | 'tailscale' | 'ngrok'

export type TunnelStatus = 'healthy' | 'degraded' | 'unhealthy' | 'starting' | 'stopped'
export type TunnelRouteStatus = 'provisioning' | 'active' | 'degraded' | 'failed' | 'removing'
export type ProcessState = 'starting' | 'running' | 'crashed' | 'stopping' | 'stopped'
export type HealthState = 'unknown' | 'healthy' | 'unhealthy' | 'degraded'

export interface TunnelRouteSpec {
  routeId: string
  desiredHostname?: string
  localPort: number
  protocol: 'http' | 'https' | 'tcp'
  zoneId?: string
}

export interface TunnelRouteResult {
  publicUrl: string
  routeRef: string
  managedDnsRecord: boolean
  meta: Record<string, unknown>
}

export interface TunnelRouteState {
  routeRef: string
  publicUrl: string
  status: 'active' | 'inactive'
}

export interface TunnelHealth {
  status: TunnelStatus
  details: {
    sidecarRunning: boolean
    sidecarUptime?: number
    connectorsConnected?: number
    lastError?: string
    lastEvent?: { at: Date; message: string }
  }
}

export interface TunnelProviderTestResult {
  ok: boolean
  error?: string
  details?: string
}

export interface TunnelProvider {
  readonly type: TunnelProviderType
  readonly providerId: string

  test(): Promise<TunnelProviderTestResult>
  start(pm: ProcessManager): Promise<void>
  stop(): Promise<void>
  addRoute(spec: TunnelRouteSpec): Promise<TunnelRouteResult>
  removeRoute(routeRef: string): Promise<void>
  listRoutes(): Promise<TunnelRouteState[]>
  health(): Promise<TunnelHealth>
}

// Internal port constants — Caddy listens on these for tunnel traffic
export const TUNNEL_PORTS = {
  cloudflare: 7100,
  ngrok: 7101,
  tailscale: [7200, 7201, 7202] as const,
  tailscaleFunnelPorts: [443, 8443, 10000] as const,
} as const

export interface BackoffConfig {
  initialDelayMs: number
  maxDelayMs: number
  multiplier: number
  resetAfterUptimeMs: number
}

export interface HealthCheckConfig {
  type: 'http' | 'tcp'
  endpoint: string
  intervalMs: number
  timeoutMs: number
  healthyAfterChecks: number
  unhealthyAfterChecks: number
}

export interface ProcessSpec {
  id: string
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string
  restartPolicy: 'always' | 'on-failure' | 'never'
  backoff: BackoffConfig
  healthCheck?: HealthCheckConfig
  logCircularBufferLines: number
  onExit?: (code: number | null, signal: string | null) => void
  onHealth?: (healthy: boolean) => void
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  initialDelayMs: 30_000,
  maxDelayMs: 3_600_000,
  multiplier: 2.0,
  resetAfterUptimeMs: 300_000,
}
