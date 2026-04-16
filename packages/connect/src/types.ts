export type ConnectionType =
  | 'cloudflare'
  | 'authentik'
  | 'authelia'
  | 'keycloak'
  | 'zitadel'
  | 'hetzner_dns'
  | 'route53'
  | 'namecheap'
  | 'tailscale'
  | 'wireguard'
  | 'uptime_kuma'
  | 'betterstack'
  | 'freshping'
  | 'zulip'
  | 'slack'
  | 'webhook'
  | 'smtp'

export type ChainNodeType = 'dns' | 'tunnel' | 'edge_waf' | 'proxy' | 'tls' | 'sso' | 'upstream'
export type ChainNodeStatus = 'ok' | 'warning' | 'error' | 'unknown'

export interface ChainNode {
  id: string
  routeId: string
  nodeType: ChainNodeType
  label: string
  status: ChainNodeStatus
  detail?: string
  warning?: string
  provider?: string
  lastCheck: Date
}

export interface RouteConfig {
  id: string
  domain: string
  upstreams: string           // JSON: Array<{ address: string }>
  tlsMode: string
  ssoEnabled: boolean
  ssoProviderId: string | null
  agentId: string | null
  enabled: boolean
}

export interface ConnectionTestResult {
  ok: boolean
  latencyMs: number
  error?: string
}

export interface ConnectionAdapter {
  readonly type: ConnectionType
  readonly connectionId: string
  test(): Promise<ConnectionTestResult>
  sync(): Promise<void>
  onRouteCreated?(route: RouteConfig): Promise<void>
  onRouteUpdated?(route: RouteConfig): Promise<void>
  onRouteDeleted?(routeId: string): Promise<void>
  getChainNodes(routeId: string): Promise<ChainNode[]>
}

export interface ConnectionRecord {
  id: string
  type: ConnectionType
  name: string
  credentials: string         // AES-256-GCM encrypted JSON
  status: 'connected' | 'disconnected' | 'error'
  lastSync: Date | null
  lastError: string | null
  config: string | null       // non-secret config as JSON
  createdAt: Date
}

export interface LockBoxCredentialRef {
  vaultId: string
  secretPath: string
}
