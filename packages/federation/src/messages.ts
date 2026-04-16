// Shared WebSocket message types for Central ↔ Agent communication

export type TLSMode = 'auto' | 'dns' | 'internal' | 'custom' | 'off'

export interface FedRoute {
  id: string
  name: string
  domain: string
  enabled: boolean
  upstreamType: string
  upstreams: string          // JSON
  tlsMode: TLSMode
  ssoEnabled: boolean
  ssoProviderId: string | null
  tlsDnsProviderId: string | null
  rateLimit: string | null
  ipAllowlist: string | null
  basicAuth: string | null
  headers: string | null
  healthCheckEnabled: boolean
  healthCheckPath: string
  healthCheckInterval: number
  compressionEnabled: boolean
  websocketEnabled: boolean
}

export interface FedSSOProvider {
  id: string
  type: string
  forwardAuthUrl: string
  authResponseHeaders: string[]
  trustedIps: string[]
}

export interface FedTLSConfig {
  dnsChallengeProvider?: string
  dnsCredentials?: string
}

// Central → Agent: full config push
export interface MsgConfigFull {
  type: 'config.full'
  routes: FedRoute[]
  ssoProviders: FedSSOProvider[]
  tlsConfig: FedTLSConfig
  timestamp: number
}

// Central → Agent: incremental diff
export interface MsgConfigDiff {
  type: 'config.diff'
  added: FedRoute[]
  updated: FedRoute[]
  removed: string[]   // route IDs
  timestamp: number
}

// Agent → Central: acknowledge config apply
export interface MsgConfigAck {
  type: 'config.ack'
  timestamp: number
  success: boolean
  error?: string
}

// Agent → Central: request full resync
export interface MsgConfigResyncRequest {
  type: 'config.resync_request'
  agentId: string
  reason: string
}

// Agent → Central: metrics push
export interface MsgMetricsPush {
  type: 'metrics.push'
  agentId: string
  timestamp: number
  routes: Record<string, {
    reqPerMin: number
    errorRate: number
    p95LatencyMs: number
    bytesIn: number
    bytesOut: number
  }>
  system: {
    caddyStatus: 'running' | 'stopped' | 'error'
    caddyVersion: string
    uptimeSeconds: number
  }
}

// Agent → Central: health report
export interface MsgHealthReport {
  type: 'health.report'
  agentId: string
  upstreams: Record<string, 'healthy' | 'degraded' | 'down'>
  certs: Record<string, { expiryDays: number; issuer: string }>
}

// Agent → Central: streamed log line
export interface MsgLogLine {
  type: 'log.line'
  agentId: string
  routeId: string
  line: Record<string, unknown>   // CaddyAccessLogEntry
}

// Keepalive
export interface MsgPing { type: 'ping' }
export interface MsgPong { type: 'pong' }

// Union of all messages
export type CentralToAgentMsg = MsgConfigFull | MsgConfigDiff | MsgPing
export type AgentToCentralMsg =
  | MsgConfigAck
  | MsgConfigResyncRequest
  | MsgMetricsPush
  | MsgHealthReport
  | MsgLogLine
  | MsgPong

export type FederationMsg = CentralToAgentMsg | AgentToCentralMsg
