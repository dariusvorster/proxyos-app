export * from './version'

export type UpstreamType = 'http' | 'tcp' | 'static' | 'redirect' | 'loadbalance'

export type TlsMode = 'auto' | 'auto-staging' | 'dns' | 'internal' | 'custom' | 'off'

export type LbPolicy = 'round_robin' | 'least_conn' | 'ip_hash' | 'random' | 'first'

export interface UpstreamConfig {
  address: string
  weight?: number  // 1–100, used with round_robin
  skipVerify?: boolean  // propagated from static upstream records
}

export interface RateLimitConfig {
  requests: number
  window: string
  key?: string // Caddy key expression e.g. '{http.request.header.X-User-ID}'
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
  healthCheckStatusCodes?: number[] | null
  healthCheckBodyRegex?: string | null
  healthCheckMaxResponseMs?: number | null
  compressionEnabled?: boolean
  websocketEnabled?: boolean
  http2Enabled?: boolean
  http3Enabled?: boolean
  skipTlsVerify?: boolean
  upstreamProtocol?: 'http' | 'https-trusted' | 'https-insecure'
  upstreamSni?: string | null
}

export type WafMode = 'off' | 'detection' | 'blocking'

export interface OAuthProxyConfig {
  providerId: string
  allowlist?: string[] // email domains or usernames
}

export interface Route extends RouteInput {
  id: string
  enabled: boolean
  ssoEnabled: boolean
  ssoProviderId: string | null
  tlsDnsProviderId: string | null
  lastTrafficAt?: Date | null
  archivedAt?: Date | null
  wafMode?: WafMode
  wafExclusions?: string[] | null
  rateLimitKey?: string | null
  tunnelProviderId?: string | null
  oauthProxyProviderId?: string | null
  oauthProxyAllowlist?: string[] | null
  tags?: string[]
  // §3.14 Blue-green
  stagingUpstreams?: UpstreamConfig[] | null
  trafficSplitPct?: number | null  // 0-100, % sent to staging
  // §3.15 Mirror / shadow
  mirrorUpstream?: string | null
  mirrorSampleRate?: number | null // 0-100
  // §4.4 AccessOS group ACLs
  accessosGroups?: string[] | null
  accessosProviderId?: string | null
  // §4.5 MxWatch mail route
  mxwatchDomain?: string | null
  // §4.6 PatchOS maintenance mode
  maintenanceMode?: boolean
  maintenanceSavedUpstreams?: UpstreamConfig[] | null
  // SSL / security headers
  forceSSL?: boolean
  hstsEnabled?: boolean
  hstsSubdomains?: boolean
  trustUpstreamHeaders?: boolean
  // §9.6 Request/response transforms
  pathRewrite?: { strip?: string; add?: string; regex?: { from: string; to: string } } | null
  corsConfig?: { preset: 'permissive' | 'restrictive' | 'custom'; allowOrigins?: string[]; allowMethods?: string[]; allowHeaders?: string[]; exposeHeaders?: string[]; maxAge?: number } | null
  // §9.8 Slow request threshold
  slowRequestThresholdMs?: number | null
  // Fix 4: roundtrip verification
  syncStatus?: string | null
  syncDiff?: string | null
  syncCheckedAt?: Date | null
  syncSource?: string | null
  // Tunnel exposure (spec: proxyos-tunnel-exposure-spec.md §9.3)
  exposureMode?: 'direct' | 'tunnel'
  tunnelRouteId?: string | null
  tunnelPublicUrl?: string | null
  // V1.1 Service Presets
  presetId?: string | null
  // V1.1 Cloudflare DNS management
  cloudflareZoneId?: string | null
  cloudflareRecordId?: string | null
  cloudflareProxied?: boolean | null
  // V1.2 Multi-domain aliases (additional public hostnames pointing at the same upstream)
  aliases?: string[] | null
  createdAt: Date
  updatedAt: Date
  origin: 'central' | 'local'
  scope: 'exclusive' | 'local_only'
}

// V1.1 — Service Presets
export type UpstreamProtocol = 'http' | 'https-trusted' | 'https-insecure'

export type PresetCategory = 'virtualization' | 'auth' | 'monitoring' | 'storage' | 'media' | 'other'

export interface ServicePreset {
  id: string
  name: string
  category: PresetCategory
  icon: string | null
  defaultPort: number
  upstreamProtocol: UpstreamProtocol
  websocket: boolean
  suggestedSubdomain: string | null
  healthCheckPath: string | null
  healthCheckExpectStatus: number | null
  defaultHeaders: Record<string, string> | null
  notes: string | null
  builtIn: boolean
  createdAt: Date
}

// §9.5 Smart routing rules
export interface RouteRule {
  id: string
  routeId: string
  priority: number
  matcherType: 'path' | 'header' | 'query' | 'method'
  matcherKey: string | null
  matcherValue: string
  action: 'upstream' | 'redirect' | 'static'
  upstream: string | null
  redirectUrl: string | null
  staticBody: string | null
  staticStatus: number | null
  enabled: boolean
  createdAt: Date
}

// §3.16 Scheduled changes
export type ScheduledChangeAction = 'enable' | 'disable' | 'update_upstream' | 'rollback'

export interface ScheduledChange {
  id: string
  routeId: string
  action: ScheduledChangeAction
  payload: Record<string, unknown> | null
  scheduledAt: Date
  executedAt: Date | null
  status: 'pending' | 'done' | 'failed' | 'cancelled'
  error: string | null
  createdAt: Date
}

// §3.18 Composite health score
export interface RouteHealthScore {
  routeId: string
  score: number          // 0-100
  uptimePct: number
  p95Ms: number | null
  errorRatePct: number
  sloCompliant: boolean
  calculatedAt: Date
}

// §3.19 Multi-tenant
export type TenantMemberRole = 'admin' | 'user'

export interface Tenant {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  accentColor: string | null
  subdomain: string | null
  createdAt: Date
}

export interface TenantMember {
  userId: string
  email: string
  displayName: string | null
  role: TenantMemberRole
  joinedAt: Date
}

// §3.13 Secrets providers
export type SecretsProviderType = 'lockboxos' | 'vault' | 'env'

export interface SecretsProvider {
  id: string
  name: string
  type: SecretsProviderType
  config: Record<string, string>
  enabled: boolean
  lastTestedAt: Date | null
  testStatus: 'ok' | 'error' | 'unknown'
  createdAt: Date
}
