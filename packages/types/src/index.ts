export * from './version'

export type UpstreamType = 'http' | 'tcp' | 'static' | 'redirect' | 'loadbalance'

export type TlsMode = 'auto' | 'dns' | 'internal' | 'custom' | 'off'

export type LbPolicy = 'round_robin' | 'least_conn' | 'ip_hash' | 'random' | 'first'

export interface UpstreamConfig {
  address: string
  weight?: number  // 1–100, used with round_robin
}

export interface RateLimitConfig {
  requests: number
  window: string
}

export interface BasicAuthConfig {
  username: string
  password: string
}

export type DnsProviderType = 'cloudflare' | 'route53' | 'porkbun' | 'digitalocean' | 'godaddy'

export interface DnsProvider {
  id: string
  name: string
  type: DnsProviderType
  credentials: Record<string, string>
  enabled: boolean
  createdAt: Date
}

export type AlertType =
  | 'error_rate_spike'
  | 'latency_spike'
  | 'cert_expiring'
  | 'traffic_spike'

export interface AlertRuleConfig {
  thresholdRequests?: number
  errorRatePct?: number
  p95LatencyMs?: number
  daysBeforeExpiry?: number
  requestsPerMinute?: number
  windowMinutes?: number
  cooldownMinutes?: number
}

export interface AlertRule {
  id: string
  name: string
  type: AlertType
  targetRouteId: string | null
  config: AlertRuleConfig
  enabled: boolean
  lastFiredAt: Date | null
  createdAt: Date
}

export interface AlertEvent {
  id: string
  ruleId: string
  routeId: string | null
  message: string
  detail: Record<string, unknown> | null
  firedAt: Date
}

export type CertSource = 'acme_le' | 'acme_zerossl' | 'dns01' | 'internal' | 'custom'
export type CertStatus = 'provisioning' | 'active' | 'renewing' | 'expired' | 'error' | 'none'

export interface Certificate {
  id: string
  domain: string
  source: CertSource
  status: CertStatus
  issuedAt: Date | null
  expiresAt: Date | null
  autoRenew: boolean
  lastRenewedAt: Date | null
  routeId: string | null
  createdAt: Date
  updatedAt: Date
}

export type SSOProviderType = 'authentik' | 'authelia' | 'keycloak' | 'zitadel'

export interface SSOProvider {
  id: string
  name: string
  type: SSOProviderType
  forwardAuthUrl: string
  authResponseHeaders: string[]
  trustedIPs: string[]
  enabled: boolean
  lastTestedAt: Date | null
  testStatus: 'ok' | 'error' | 'unknown'
  createdAt: Date
}

export interface RouteInput {
  name: string
  domain: string
  upstreamType: UpstreamType
  upstreams: UpstreamConfig[]
  lbPolicy?: LbPolicy
  tlsMode: TlsMode
  tlsDnsProviderId?: string | null
  ssoEnabled?: boolean
  ssoProviderId?: string | null
  rateLimit?: RateLimitConfig | null
  ipAllowlist?: string[] | null
  basicAuth?: BasicAuthConfig | null
  headers?: Record<string, unknown> | null
  healthCheckEnabled?: boolean
  healthCheckPath?: string
  healthCheckInterval?: number
  compressionEnabled?: boolean
  websocketEnabled?: boolean
  http2Enabled?: boolean
  http3Enabled?: boolean
}

export interface Route extends RouteInput {
  id: string
  enabled: boolean
  ssoEnabled: boolean
  ssoProviderId: string | null
  tlsDnsProviderId: string | null
  lastTrafficAt?: Date | null
  archivedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}
