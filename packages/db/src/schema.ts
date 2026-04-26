import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const routes = sqliteTable('routes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  domain: text('domain').notNull().unique(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

  upstreamType: text('upstream_type').notNull(),
  upstreams: text('upstreams').notNull(),
  lbPolicy: text('lb_policy').notNull().default('round_robin'),

  tlsMode: text('tls_mode').notNull().default('auto'),

  ssoEnabled: integer('sso_enabled', { mode: 'boolean' }).notNull().default(false),
  ssoProviderId: text('sso_provider_id'),

  tlsDnsProviderId: text('tls_dns_provider_id'),

  rateLimit: text('rate_limit'),
  ipAllowlist: text('ip_allowlist'),
  basicAuth: text('basic_auth'),
  headers: text('headers'),

  healthCheckEnabled: integer('health_check_enabled', { mode: 'boolean' }).notNull().default(true),
  healthCheckPath: text('health_check_path').notNull().default('/'),
  healthCheckInterval: integer('health_check_interval').notNull().default(30),
  healthCheckStatusCodes: text('health_check_status_codes'),  // JSON number[]
  healthCheckBodyRegex: text('health_check_body_regex'),
  healthCheckMaxResponseMs: integer('health_check_max_response_ms'),

  compressionEnabled: integer('compression_enabled', { mode: 'boolean' }).notNull().default(true),
  websocketEnabled: integer('websocket_enabled', { mode: 'boolean' }).notNull().default(true),
  http2Enabled: integer('http2_enabled', { mode: 'boolean' }).notNull().default(true),
  http3Enabled: integer('http3_enabled', { mode: 'boolean' }).notNull().default(true),

  agentId: text('agent_id'),

  lastTrafficAt: integer('last_traffic_at', { mode: 'timestamp' }),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),

  wafMode: text('waf_mode').notNull().default('off'),
  wafExclusions: text('waf_exclusions'),
  rateLimitKey: text('rate_limit_key'),
  tunnelProviderId: text('tunnel_provider_id'),
  oauthProxyProviderId: text('oauth_proxy_provider_id'),
  oauthProxyAllowlist: text('oauth_proxy_allowlist'),

  // §3.14 Blue-green
  stagingUpstreams: text('staging_upstreams'),
  trafficSplitPct: integer('traffic_split_pct'),

  // §3.15 Mirror
  mirrorUpstream: text('mirror_upstream'),
  mirrorSampleRate: integer('mirror_sample_rate'),

  // §4.4 AccessOS
  accessosGroups: text('accessos_groups'),
  accessosProviderId: text('accessos_provider_id'),

  // §4.5 MxWatch
  mxwatchDomain: text('mxwatch_domain'),

  // §4.6 PatchOS maintenance
  maintenanceMode: integer('maintenance_mode', { mode: 'boolean' }).notNull().default(false),
  maintenanceSavedUpstreams: text('maintenance_saved_upstreams'),

  // §3.19 Multi-tenant
  tenantId: text('tenant_id'),

  // Federation
  siteId: text('site_id'),
  origin: text('origin', { enum: ['central', 'local'] }).notNull().default('local'),
  configVersion: integer('config_version').notNull().default(1),
  scope: text('scope', { enum: ['exclusive', 'local_only'] }).notNull().default('exclusive'),

  // §9.6 Request/response transforms
  pathRewrite: text('path_rewrite'),
  corsConfig: text('cors_config'),

  // §9.8 Slow request threshold
  slowRequestThresholdMs: integer('slow_request_threshold_ms').default(1000),

  // §9.9 Bandwidth limit
  bandwidthLimitBytes: integer('bandwidth_limit_bytes'),

  // SSL / security headers
  forceSSL: integer('force_ssl', { mode: 'boolean' }).notNull().default(false),
  hstsEnabled: integer('hsts_enabled', { mode: 'boolean' }).notNull().default(false),
  hstsSubdomains: integer('hsts_subdomains', { mode: 'boolean' }).notNull().default(false),
  trustUpstreamHeaders: integer('trust_upstream_headers', { mode: 'boolean' }).notNull().default(false),
  skipTlsVerify: integer('skip_tls_verify', { mode: 'boolean' }).notNull().default(false),

  // V1.1: explicit upstream protocol — replaces port-based HTTPS auto-detection
  upstreamProtocol: text('upstream_protocol', { enum: ['http', 'https-trusted', 'https-insecure'] as const }).notNull().default('http'),
  upstreamSni: text('upstream_sni'),

  // V1.1: service preset that was used to create this route (nullable)
  presetId: text('preset_id'),

  // V1.1: Cloudflare DNS management fields
  cloudflareZoneId: text('cloudflare_zone_id'),
  cloudflareRecordId: text('cloudflare_record_id'),
  cloudflareProxied: integer('cloudflare_proxied', { mode: 'boolean' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),

  syncStatus: text('sync_status'),
  syncDiff: text('sync_diff'),
  syncCheckedAt: integer('sync_checked_at', { mode: 'timestamp' }),
  syncSource: text('sync_source'),

  // Tunnel exposure (spec: proxyos-tunnel-exposure-spec.md §9.3)
  exposureMode: text('exposure_mode').notNull().default('direct'),
  tunnelRouteId: text('tunnel_route_id'),
  tunnelPublicUrl: text('tunnel_public_url'),
})

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  resourceName: text('resource_name'),
  actor: text('actor').notNull().default('user'),
  detail: text('detail'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const ssoProviders = sqliteTable('sso_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  forwardAuthUrl: text('forward_auth_url').notNull(),
  authResponseHeaders: text('auth_response_headers').notNull().default('[]'),
  trustedIPs: text('trusted_ips').notNull().default('[]'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastTestedAt: integer('last_tested_at', { mode: 'timestamp' }),
  testStatus: text('test_status').notNull().default('unknown'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const dnsProviders = sqliteTable('dns_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  credentials: text('credentials').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const certificates = sqliteTable('certificates', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  issuedAt: integer('issued_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  autoRenew: integer('auto_renew', { mode: 'boolean' }).notNull().default(true),
  lastRenewedAt: integer('last_renewed_at', { mode: 'timestamp' }),
  routeId: text('route_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const trafficMetrics = sqliteTable('traffic_metrics', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull(),
  bucket: text('bucket').notNull(),
  bucketTs: integer('bucket_ts').notNull(),
  requests: integer('requests').notNull().default(0),
  bytes: integer('bytes').notNull().default(0),
  errors: integer('errors').notNull().default(0),
  status2xx: integer('status_2xx').notNull().default(0),
  status3xx: integer('status_3xx').notNull().default(0),
  status4xx: integer('status_4xx').notNull().default(0),
  status5xx: integer('status_5xx').notNull().default(0),
  latencySumMs: integer('latency_sum_ms').notNull().default(0),
})

export const accessLog = sqliteTable('access_log', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull(),
  method: text('method'),
  path: text('path'),
  statusCode: integer('status_code'),
  latencyMs: integer('latency_ms'),
  bytesOut: integer('bytes_out'),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
})

export type RouteRow = typeof routes.$inferSelect
export type NewRouteRow = typeof routes.$inferInsert
export type SSOProviderRow = typeof ssoProviders.$inferSelect
export type DnsProviderRow = typeof dnsProviders.$inferSelect
export type CertificateRow = typeof certificates.$inferSelect
export type TrafficMetricRow = typeof trafficMetrics.$inferSelect
export type AccessLogRow = typeof accessLog.$inferSelect

export const alertRules = sqliteTable('alert_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  targetRouteId: text('target_route_id'),
  config: text('config').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastFiredAt: integer('last_fired_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const alertEvents = sqliteTable('alert_events', {
  id: text('id').primaryKey(),
  ruleId: text('rule_id').notNull(),
  routeId: text('route_id'),
  message: text('message').notNull(),
  detail: text('detail'),
  firedAt: integer('fired_at', { mode: 'timestamp' }).notNull(),
})

export type AlertRuleRow = typeof alertRules.$inferSelect
export type AlertEventRow = typeof alertEvents.$inferSelect

// V2 — Federation
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  siteTag: text('site_tag'),
  description: text('description'),
  tokenHash: text('token_hash').notNull(),
  tokenExpiresAt: integer('token_expires_at').notNull(),
  status: text('status').notNull().default('offline'),
  lastSeen: integer('last_seen', { mode: 'timestamp' }),
  caddyVersion: text('caddy_version'),
  routeCount: integer('route_count').notNull().default(0),
  certCount: integer('cert_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const revokedAgentTokens = sqliteTable('revoked_agent_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }).notNull(),
  reason: text('reason'),
})

export const agentMetrics = sqliteTable('agent_metrics', {
  agentId: text('agent_id').notNull(),
  routeId: text('route_id').notNull(),
  bucket: integer('bucket').notNull(),
  reqCount: integer('req_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  p95Ms: integer('p95_ms'),
  bytesIn: integer('bytes_in').notNull().default(0),
  bytesOut: integer('bytes_out').notNull().default(0),
})

// V2 — Import
export const importSessions = sqliteTable('import_sessions', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  routeCount: integer('route_count').notNull().default(0),
  imported: integer('imported').notNull().default(0),
  skipped: integer('skipped').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  resultJson: text('result_json'),
})

// V2 — Scanner
export const scannedContainers = sqliteTable('scanned_containers', {
  id: text('id').primaryKey(),
  agentId: text('agent_id'),
  name: text('name').notNull(),
  image: text('image').notNull(),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull(),
  routeId: text('route_id'),
  strategy: text('strategy'),
  confidence: text('confidence'),
})

export type AgentRow = typeof agents.$inferSelect
export type ImportSessionRow = typeof importSessions.$inferSelect
export type ScannedContainerRow = typeof scannedContainers.$inferSelect

// V3 — Connect
export const connections = sqliteTable('connections', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  credentials: text('credentials').notNull(),
  status: text('status').notNull().default('disconnected'),
  lastSync: integer('last_sync', { mode: 'timestamp' }),
  lastError: text('last_error'),
  config: text('config'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const connectionSyncLog = sqliteTable('connection_sync_log', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull().references(() => connections.id),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  result: text('result'),
  message: text('message'),
  durationMs: integer('duration_ms'),
})

export const dnsRecordsShadow = sqliteTable('dns_records_shadow', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull().references(() => connections.id),
  zoneId: text('zone_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  value: text('value').notNull(),
  proxied: integer('proxied').notNull().default(0),
  ttl: integer('ttl'),
  routeId: text('route_id').references(() => routes.id),
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull(),
})

export const tunnelRules = sqliteTable('tunnel_rules', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull().references(() => connections.id),
  tunnelId: text('tunnel_id').notNull(),
  hostname: text('hostname').notNull(),
  service: text('service').notNull(),
  routeId: text('route_id').references(() => routes.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const monitors = sqliteTable('monitors', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull().references(() => connections.id),
  routeId: text('route_id').notNull().references(() => routes.id),
  url: text('url').notNull(),
  status: text('status'),
  lastCheck: integer('last_check', { mode: 'timestamp' }),
  providerUrl: text('provider_url'),
})

export const chainNodes = sqliteTable('chain_nodes', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull().references(() => routes.id),
  nodeType: text('node_type').notNull(),
  label: text('label').notNull(),
  status: text('status').notNull(),
  detail: text('detail'),
  warning: text('warning'),
  provider: text('provider'),
  lastCheck: integer('last_check', { mode: 'timestamp' }).notNull(),
})

export const ipBans = sqliteTable('ip_bans', {
  ip: text('ip').primaryKey(),
  reason: text('reason').notNull(),
  ruleName: text('rule_name'),
  bannedAt: integer('banned_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  routeId: text('route_id').references(() => routes.id),
  permanent: integer('permanent').notNull().default(0),
})

export const fail2banRules = sqliteTable('fail2ban_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  config: text('config').notNull(),
  enabled: integer('enabled').notNull().default(1),
  hitCount: integer('hit_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const routeTemplates = sqliteTable('route_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  config: text('config').notNull(),
  builtIn: integer('built_in').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  scopes: text('scopes').notNull(),
  lastUsed: integer('last_used', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('viewer'),
  displayName: text('display_name'),
  avatarColor: text('avatar_color'),
  avatarUrl: text('avatar_url'),
  ssoProvider: text('sso_provider'),
  ssoSubject: text('sso_subject'),
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled').notNull().default(0),
  totpLastCounter: integer('totp_last_counter'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastLogin: integer('last_login', { mode: 'timestamp' }),
})

export const routeOwnership = sqliteTable('route_ownership', {
  routeId: text('route_id').primaryKey().references(() => routes.id),
  userId: text('user_id').notNull().references(() => users.id),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull(),
})

export const pendingChanges = sqliteTable('pending_changes', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  payload: text('payload').notNull(),
  requestedBy: text('requested_by').notNull().references(() => users.id),
  requestedAt: integer('requested_at', { mode: 'timestamp' }).notNull(),
  approvedBy: text('approved_by').references(() => users.id),
  approvedAt: integer('approved_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('pending'),
})

export const routeSlos = sqliteTable('route_slos', {
  routeId: text('route_id').primaryKey().references(() => routes.id),
  p95TargetMs: integer('p95_target_ms').notNull(),
  p99TargetMs: integer('p99_target_ms'),
  windowDays: integer('window_days').notNull().default(30),
  alertOnBreach: integer('alert_on_breach').notNull().default(1),
})

export const sloCompliance = sqliteTable('slo_compliance', {
  routeId: text('route_id').notNull().references(() => routes.id),
  date: text('date').notNull(),
  p95ActualMs: integer('p95_actual_ms'),
  p99ActualMs: integer('p99_actual_ms'),
  p95Compliant: integer('p95_compliant'),
  p99Compliant: integer('p99_compliant'),
  sampleCount: integer('sample_count'),
})

export const anomalyBaselines = sqliteTable('anomaly_baselines', {
  routeId: text('route_id').notNull().references(() => routes.id),
  metric: text('metric').notNull(),
  hourOfWeek: integer('hour_of_week').notNull(),
  mean: integer('mean').notNull(),
  stddev: integer('stddev').notNull(),
  sampleCount: integer('sample_count').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const routeSecurity = sqliteTable('route_security', {
  routeId: text('route_id').primaryKey().references(() => routes.id, { onDelete: 'cascade' }),
  geoipConfig: text('geoip_config'),           // JSON: GeoIPConfig | null
  jwtConfig: text('jwt_config'),               // JSON: JWTConfig | null
  mtlsConfig: text('mtls_config'),             // JSON: MTLSConfig | null
  botChallengeConfig: text('bot_challenge_config'), // JSON: BotChallengeConfig | null
  exitNodeConfig: text('exit_node_config'),    // JSON: ExitNodeBlockConfig | null
  secretHeader: text('secret_header'),         // JSON: SecretHeaderConfig | null
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const webhookDeliveryLog = sqliteTable('webhook_delivery_log', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull().references(() => connections.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  url: text('url').notNull(),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms').notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
  error: text('error'),
  payloadPreview: text('payload_preview'),
  deliveredAt: integer('delivered_at', { mode: 'timestamp' }).notNull(),
})

export type ConnectionRow = typeof connections.$inferSelect
export type ConnectionSyncLogRow = typeof connectionSyncLog.$inferSelect
export type MonitorRow = typeof monitors.$inferSelect
export type ChainNodeRow = typeof chainNodes.$inferSelect
export type ApiKeyRow = typeof apiKeys.$inferSelect
export type UserRow = typeof users.$inferSelect

// V3 — Observability

export const systemLog = sqliteTable('system_log', {
  id: text('id').primaryKey(),
  level: text('level').notNull(),      // 'info' | 'warn' | 'error'
  category: text('category').notNull(), // 'auth' | 'caddy' | 'system' | 'api' | 'user'
  message: text('message').notNull(),
  detail: text('detail'),              // JSON
  userId: text('user_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type SystemLogRow = typeof systemLog.$inferSelect

export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const ctAlerts = sqliteTable('ct_alerts', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  issuer: text('issuer').notNull(),
  notBefore: text('not_before').notNull(),
  serialNumber: text('serial_number').notNull(),
  detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull(),
  acknowledged: integer('acknowledged', { mode: 'boolean' }).notNull().default(false),
})

export const multiDomainCerts = sqliteTable('multi_domain_certs', {
  id: text('id').primaryKey(),
  domains: text('domains').notNull(),          // JSON string[]
  mode: text('mode').notNull().default('auto'), // 'auto' | 'dns'
  routes: text('routes').notNull().default('[]'), // JSON string[]
  issuer: text('issuer'),
  expiry: integer('expiry', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const acmeAccounts = sqliteTable('acme_accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  provider: text('provider').notNull().default('letsencrypt'),
  acmeUrl: text('acme_url').notNull(),
  certsCount: integer('certs_count').notNull().default(0),
  rateLimitUsed: integer('rate_limit_used').notNull().default(0),
  rateLimitResetAt: integer('rate_limit_reset_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type CTAlertRow = typeof ctAlerts.$inferSelect
export type MultiDomainCertRow = typeof multiDomainCerts.$inferSelect
export type AcmeAccountRow = typeof acmeAccounts.$inferSelect

// V3 — Automation

export const composeWatchers = sqliteTable('compose_watchers', {
  id: text('id').primaryKey(),
  projectPath: text('project_path').notNull(),
  agentId: text('agent_id'),
  autoApply: integer('auto_apply', { mode: 'boolean' }).notNull().default(true),
  watchInterval: integer('watch_interval').notNull().default(30),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastChecked: integer('last_checked', { mode: 'timestamp' }),
  lastResult: text('last_result'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type ComposeWatcherRow = typeof composeWatchers.$inferSelect

// V3 — Homelab OS integrations

export const lockboxRefs = sqliteTable('lockbox_refs', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull(),
  credentialKey: text('credential_key').notNull(),
  vaultId: text('vault_id').notNull(),
  secretPath: text('secret_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const patchosVersions = sqliteTable('patchos_versions', {
  agentId: text('agent_id').primaryKey(),
  version: text('version').notNull(),
  health: text('health').notNull().default('ok'),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
})

export type LockboxRefRow = typeof lockboxRefs.$inferSelect
export type PatchosVersionRow = typeof patchosVersions.$inferSelect

// Billing — subscriptions, entitlements, licence keys

export const billingSubscriptions = sqliteTable('billing_subscriptions', {
  id: text('id').primaryKey(),
  product: text('product').notNull(),
  userId: text('user_id').notNull(),
  email: text('email').notNull(),
  lsSubscriptionId: text('ls_subscription_id').notNull().unique(),
  lsCustomerId: text('ls_customer_id').notNull(),
  lsOrderId: text('ls_order_id').notNull(),
  lsVariantId: text('ls_variant_id').notNull(),
  lsCustomerPortalUrl: text('ls_customer_portal_url'),
  plan: text('plan').notNull(),
  billingInterval: text('billing_interval').notNull(),
  status: text('status').notNull().default('active'),
  licenceType: text('licence_type').notNull().default('cloud'),
  currentPeriodStart: integer('current_period_start').notNull(),
  currentPeriodEnd: integer('current_period_end').notNull(),
  trialEndsAt: integer('trial_ends_at'),
  cancelledAt: integer('cancelled_at'),
  expiresAt: integer('expires_at'),
  paymentFailedAt: integer('payment_failed_at'),
  dunningStep: integer('dunning_step').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const billingEntitlements = sqliteTable('billing_entitlements', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  product: text('product').notNull(),
  plan: text('plan').notNull(),
  source: text('source').notNull(),
  validUntil: integer('valid_until'),
  updatedAt: integer('updated_at').notNull(),
})

export const licenceKeys = sqliteTable('licence_keys', {
  id: text('id').primaryKey(),
  product: text('product').notNull(),
  purchaserEmail: text('purchaser_email').notNull(),
  lsLicenceKey: text('ls_licence_key').notNull().unique(),
  lsOrderId: text('ls_order_id').notNull(),
  lsVariantId: text('ls_variant_id').notNull(),
  lsInstanceId: text('ls_instance_id'),
  plan: text('plan').notNull(),
  billingInterval: text('billing_interval').notNull(),
  status: text('status').notNull().default('inactive'),
  instanceName: text('instance_name'),
  lastValidatedAt: integer('last_validated_at'),
  validationFailures: integer('validation_failures').notNull().default(0),
  gracePeriodUntil: integer('grace_period_until'),
  expiresAt: integer('expires_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const billingEvents = sqliteTable('billing_events', {
  id: text('id').primaryKey(),
  product: text('product').notNull(),
  userId: text('user_id').notNull(),
  eventType: text('event_type').notNull(),
  planFrom: text('plan_from'),
  planTo: text('plan_to'),
  amountUsdCents: integer('amount_usd_cents'),
  billingInterval: text('billing_interval'),
  lsEventId: text('ls_event_id'),
  createdAt: integer('created_at').notNull(),
})

export const billingWebhookEvents = sqliteTable('billing_webhook_events', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().unique(),
  eventName: text('event_name').notNull(),
  product: text('product'),
  payload: text('payload').notNull(),
  processedAt: integer('processed_at').notNull(),
  error: text('error'),
})

export type BillingSubscriptionRow = typeof billingSubscriptions.$inferSelect
export type BillingEntitlementRow = typeof billingEntitlements.$inferSelect
export type LicenceKeyRow = typeof licenceKeys.$inferSelect
export type BillingEventRow = typeof billingEvents.$inferSelect

// V3.1 — Host types, access lists, operation logs

export const redirectHosts = sqliteTable('redirect_hosts', {
  id: text('id').primaryKey(),
  agentId: text('agent_id'),
  sourceDomain: text('source_domain').notNull().unique(),
  destinationUrl: text('destination_url').notNull(),
  redirectCode: integer('redirect_code').notNull().default(301),
  preservePath: integer('preserve_path', { mode: 'boolean' }).notNull().default(true),
  preserveQuery: integer('preserve_query', { mode: 'boolean' }).notNull().default(true),
  tlsEnabled: integer('tls_enabled', { mode: 'boolean' }).notNull().default(true),
  accessListId: text('access_list_id'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const streams = sqliteTable('streams', {
  id: text('id').primaryKey(),
  agentId: text('agent_id'),
  listenPort: integer('listen_port').notNull().unique(),
  protocol: text('protocol').notNull().default('tcp'), // 'tcp' | 'udp' | 'tcp+udp'
  upstreamHost: text('upstream_host').notNull(),
  upstreamPort: integer('upstream_port').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const errorHosts = sqliteTable('error_hosts', {
  id: text('id').primaryKey(),
  agentId: text('agent_id'),
  domain: text('domain').notNull().unique(),
  statusCode: integer('status_code').notNull().default(404),
  pageType: text('page_type').notNull().default('default'), // 'default' | 'custom_html' | 'redirect'
  customHtml: text('custom_html'),
  redirectUrl: text('redirect_url'),
  tlsEnabled: integer('tls_enabled', { mode: 'boolean' }).notNull().default(true),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const accessLists = sqliteTable('access_lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  satisfyMode: text('satisfy_mode').notNull().default('any'), // 'any' | 'all'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const accessListIpRules = sqliteTable('access_list_ip_rules', {
  id: text('id').primaryKey(),
  accessListId: text('access_list_id').notNull(),
  type: text('type').notNull(), // 'allow' | 'deny'
  value: text('value').notNull(), // CIDR or IP
  comment: text('comment'),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const accessListAuthUsers = sqliteTable('access_list_auth_users', {
  id: text('id').primaryKey(),
  accessListId: text('access_list_id').notNull(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
})

export const accessListAuthConfig = sqliteTable('access_list_auth_config', {
  accessListId: text('access_list_id').primaryKey(),
  realm: text('realm').notNull().default('ProxyOS'),
  protectedPaths: text('protected_paths'), // JSON string[]
})

export const operationLogs = sqliteTable('operation_logs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'route_create' | 'cert_issue' | etc.
  subject: text('subject').notNull(),
  status: text('status').notNull().default('in_progress'), // 'in_progress' | 'success' | 'error'
  steps: text('steps').notNull().default('[]'), // JSON OperationStep[]
  durationMs: integer('duration_ms'),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const certIssuanceLog = sqliteTable('cert_issuance_log', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  registeredDomain: text('registered_domain').notNull(),
  provider: text('provider').notNull(), // 'letsencrypt' | 'zerossl' | 'internal' | 'custom'
  method: text('method'), // 'http01' | 'dns01'
  issuedAt: integer('issued_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
})

export type RedirectHostRow = typeof redirectHosts.$inferSelect
export type StreamRow = typeof streams.$inferSelect
export type ErrorHostRow = typeof errorHosts.$inferSelect
export type AccessListRow = typeof accessLists.$inferSelect
export type AccessListIpRuleRow = typeof accessListIpRules.$inferSelect
export type AccessListAuthUserRow = typeof accessListAuthUsers.$inferSelect
export type AccessListAuthConfigRow = typeof accessListAuthConfig.$inferSelect
export type OperationLogRow = typeof operationLogs.$inferSelect
export type CertIssuanceLogRow = typeof certIssuanceLog.$inferSelect

// V2 — Phase 1 features

export const driftEvents = sqliteTable('drift_events', {
  id: text('id').primaryKey(),
  detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull(),
  type: text('type').notNull(), // 'missing_in_db' | 'missing_in_caddy' | 'config_mismatch'
  routeId: text('route_id'),
  diffJson: text('diff_json'),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  resolution: text('resolution'),
})

export const routeVersions = sqliteTable('route_versions', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  configSnapshotJson: text('config_snapshot_json').notNull(),
  changedBy: text('changed_by').notNull().default('user'),
  changedAt: integer('changed_at', { mode: 'timestamp' }).notNull(),
  changeReason: text('change_reason'),
  rollbackOf: text('rollback_of'),
})

export const healthChecks = sqliteTable('health_checks', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  checkedAt: integer('checked_at', { mode: 'timestamp' }).notNull(),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms'),
  bodyMatched: integer('body_matched', { mode: 'boolean' }),
  overallStatus: text('overall_status').notNull(), // 'healthy' | 'degraded' | 'unhealthy'
  error: text('error'),
})

export type DriftEventRow = typeof driftEvents.$inferSelect
export type RouteVersionRow = typeof routeVersions.$inferSelect
export type HealthCheckRow = typeof healthChecks.$inferSelect

// V2 Phase 2 features

// §3.21 Tags
export const routeTags = sqliteTable('route_tags', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
})

// §3.4 Service discovery
export const discoveryProviders = sqliteTable('discovery_providers', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'docker' | 'proxmox' | 'infraos'
  name: text('name').notNull(),
  config: text('config').notNull(), // JSON
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
  syncIntervalS: integer('sync_interval_s').notNull().default(60),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const discoveredRoutes = sqliteTable('discovered_routes', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => discoveryProviders.id, { onDelete: 'cascade' }),
  sourceRef: text('source_ref').notNull(),
  domain: text('domain').notNull(),
  upstreamUrl: text('upstream_url').notNull(),
  templateId: text('template_id'),
  promotedRouteId: text('promoted_route_id'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// §3.12 DDNS
export const ddnsRecords = sqliteTable('ddns_records', {
  id: text('id').primaryKey(),
  dnsProviderId: text('dns_provider_id').notNull(),
  zone: text('zone').notNull(),
  recordName: text('record_name').notNull(),
  recordType: text('record_type').notNull().default('A'), // 'A' | 'AAAA'
  lastIp: text('last_ip'),
  lastUpdatedAt: integer('last_updated_at', { mode: 'timestamp' }),
  updateIntervalS: integer('update_interval_s').notNull().default(300),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// §3.5 Tunnel providers
export const tunnelProviders = sqliteTable('tunnel_providers', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'cloudflare' | 'tailscale' | 'ngrok'
  name: text('name').notNull(),
  credentials: text('credentials').notNull(), // JSON encrypted at rest
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('disconnected'), // 'connected' | 'disconnected' | 'error'
  lastTestedAt: integer('last_tested_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  // Process tracking
  processPid: integer('process_pid'),
  processStatus: text('process_status'), // 'starting'|'running'|'crashed'|'stopped'|'degraded'
  processStartedAt: integer('process_started_at', { mode: 'timestamp' }),
  processRestartCount: integer('process_restart_count').notNull().default(0),
  lastHealthCheckAt: integer('last_health_check_at', { mode: 'timestamp' }),
  lastHealthStatus: text('last_health_status'),
  lastHealthError: text('last_health_error'),
  stateJson: text('state_json'), // provider runtime state (tunnelId, tsNodeId, etc.)
})

// §9.2 Tunnel routes — per-route tunnel provisioning state
export const tunnelRoutes = sqliteTable('tunnel_routes', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  tunnelProviderId: text('tunnel_provider_id').notNull().references(() => tunnelProviders.id, { onDelete: 'cascade' }),
  providerRouteRef: text('provider_route_ref').notNull(), // identifier at provider side
  publicUrl: text('public_url').notNull(),
  internalListenPort: integer('internal_listen_port').notNull(),
  status: text('status').notNull().default('provisioning'), // 'provisioning'|'active'|'degraded'|'failed'|'removing'
  provisionedAt: integer('provisioned_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  metaJson: text('meta_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// §9.4 Tunnel events — audit + troubleshooting
export const tunnelEvents = sqliteTable('tunnel_events', {
  id: text('id').primaryKey(),
  tunnelProviderId: text('tunnel_provider_id').references(() => tunnelProviders.id, { onDelete: 'cascade' }),
  routeId: text('route_id').references(() => routes.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(), // 'process_start'|'process_crash'|'route_added'|'route_removed'|etc.
  severity: text('severity').notNull().default('info'), // 'info'|'warn'|'error'|'critical'
  message: text('message').notNull(),
  detailsJson: text('details_json'),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
})

export type TunnelRouteRow = typeof tunnelRoutes.$inferSelect
export type TunnelEventRow = typeof tunnelEvents.$inferSelect

// §3.10 WAF events
export const wafEvents = sqliteTable('waf_events', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  ruleId: text('rule_id'),
  action: text('action').notNull(), // 'detected' | 'blocked'
  clientIp: text('client_ip'),
  path: text('path'),
  message: text('message'),
  detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull(),
})

// §3.6 OAuth2 providers
export const oauthProviders = sqliteTable('oauth_providers', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'github' | 'google' | 'microsoft' | 'oidc'
  name: text('name').notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret').notNull(),
  oidcDiscoveryUrl: text('oidc_discovery_url'),
  allowedDomains: text('allowed_domains'), // JSON string[]
  allowedUsers: text('allowed_users'), // JSON string[]
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type RouteTagRow = typeof routeTags.$inferSelect
export type DiscoveryProviderRow = typeof discoveryProviders.$inferSelect
export type DiscoveredRouteRow = typeof discoveredRoutes.$inferSelect
export type DdnsRecordRow = typeof ddnsRecords.$inferSelect
export type TunnelProviderRow = typeof tunnelProviders.$inferSelect
export type WafEventRow = typeof wafEvents.$inferSelect
export type OAuthProviderRow = typeof oauthProviders.$inferSelect

// Phase 3 tables

// §3.13 Secrets providers
export const secretsProviders = sqliteTable('secrets_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'lockboxos' | 'vault' | 'env'
  config: text('config').notNull(), // JSON
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastTestedAt: integer('last_tested_at', { mode: 'timestamp' }),
  testStatus: text('test_status').notNull().default('unknown'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// §3.16 Scheduled changes
export const scheduledChanges = sqliteTable('scheduled_changes', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  action: text('action').notNull(), // 'enable' | 'disable' | 'update_upstream' | 'rollback'
  payload: text('payload'), // JSON
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }).notNull(),
  executedAt: integer('executed_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('pending'), // 'pending' | 'done' | 'failed' | 'cancelled'
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// §3.17 Traffic replay
export const trafficReplayLogs = sqliteTable('traffic_replay_logs', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  method: text('method').notNull(),
  path: text('path').notNull(),
  query: text('query'),
  headers: text('headers'), // JSON
  body: text('body'),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms'),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
})

// §3.18 Composite health scores
export const routeHealthScores = sqliteTable('route_health_scores', {
  routeId: text('route_id').primaryKey().references(() => routes.id, { onDelete: 'cascade' }),
  score: integer('score').notNull().default(100),
  uptimePct: integer('uptime_pct').notNull().default(100),
  p95Ms: integer('p95_ms'),
  errorRatePct: integer('error_rate_pct').notNull().default(0),
  sloCompliant: integer('slo_compliant', { mode: 'boolean' }).notNull().default(true),
  calculatedAt: integer('calculated_at', { mode: 'timestamp' }).notNull(),
})

export type SecretsProviderRow = typeof secretsProviders.$inferSelect
export type ScheduledChangeRow = typeof scheduledChanges.$inferSelect
export type TrafficReplayLogRow = typeof trafficReplayLogs.$inferSelect
export type RouteHealthScoreRow = typeof routeHealthScores.$inferSelect

// Phase 4 — OS family integrations

// §4.5 MxWatch deliverability cache
export const mxwatchCache = sqliteTable('mxwatch_cache', {
  domain: text('domain').primaryKey(),
  deliverabilityScore: integer('deliverability_score'),
  rblListed: integer('rbl_listed', { mode: 'boolean' }).notNull().default(false),
  rblDetails: text('rbl_details'), // JSON string[]
  dkimPass: integer('dkim_pass', { mode: 'boolean' }),
  spfPass: integer('spf_pass', { mode: 'boolean' }),
  dmarcPass: integer('dmarc_pass', { mode: 'boolean' }),
  checkedAt: integer('checked_at', { mode: 'timestamp' }).notNull(),
})

export type MxwatchCacheRow = typeof mxwatchCache.$inferSelect

// §3.19 Multi-tenant

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  accentColor: text('accent_color'),
  subdomain: text('subdomain'),
  plan: text('plan', { enum: ['self_hosted', 'cloud_starter', 'cloud_pro', 'cloud_enterprise'] }).notNull().default('self_hosted'),
  status: text('status', { enum: ['active', 'suspended', 'archived'] }).notNull().default('active'),
  settingsJson: text('settings_json').notNull().default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const userTenants = sqliteTable('user_tenants', {
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
})

export type TenantRow = typeof tenants.$inferSelect
export type UserTenantRow = typeof userTenants.$inferSelect

// Phase 6 — Docker auto network discovery

export const discoveredNetworks = sqliteTable('discovered_networks', {
  id: text('id').primaryKey(), // Docker network ID
  name: text('name').notNull(),
  driver: text('driver').notNull(),
  scope: text('scope').notNull(),
  containerCount: integer('container_count').notNull().default(0),
  status: text('status').notNull().default('available'), // 'joined' | 'available' | 'excluded' | 'unreachable'
  joinedAt: integer('joined_at', { mode: 'timestamp' }),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
  excludedByUser: integer('excluded_by_user', { mode: 'boolean' }).notNull().default(false),
  excludedReason: text('excluded_reason'),
  isProxyosManaged: integer('is_proxyos_managed', { mode: 'boolean' }).notNull().default(false),
  isWellKnown: integer('is_well_known', { mode: 'boolean' }).notNull().default(false),
  wellKnownPurpose: text('well_known_purpose'),
})

export const networkSyncEvents = sqliteTable('network_sync_events', {
  id: text('id').primaryKey(),
  networkId: text('network_id'),
  eventType: text('event_type').notNull(), // 'joined' | 'left' | 'failed' | 'excluded' | 'rescanned'
  message: text('message'),
  detailsJson: text('details_json'),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
})

export type DiscoveredNetworkRow = typeof discoveredNetworks.$inferSelect
export type NetworkSyncEventRow = typeof networkSyncEvents.$inferSelect

// Phase 6b — Static (non-Docker) upstream definitions

export const staticUpstreams = sqliteTable('static_upstreams', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(), // referenced from routes by this name
  host: text('host').notNull(),          // hostname, IP, or Tailscale MagicDNS name
  defaultPort: integer('default_port'),
  defaultScheme: text('default_scheme').notNull().default('http'), // 'http' | 'https'
  description: text('description'),
  tlsSkipVerify: integer('tls_skip_verify', { mode: 'boolean' }).notNull().default(false),
  healthCheckPath: text('health_check_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export type StaticUpstreamRow = typeof staticUpstreams.$inferSelect

// Phase A — Federation hierarchy

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
})

export const sites = sqliteTable('sites', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
})

export const orgMemberships = sqliteTable('org_memberships', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  organizationId: text('organization_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role', { enum: ['org_admin', 'org_operator', 'org_viewer'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const siteMemberships = sqliteTable('site_memberships', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  siteId: text('site_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role', { enum: ['site_operator', 'site_viewer'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type OrganizationRow = typeof organizations.$inferSelect
export type SiteRow = typeof sites.$inferSelect
export type OrgMembershipRow = typeof orgMemberships.$inferSelect
export type SiteMembershipRow = typeof siteMemberships.$inferSelect

// Phase B — Federation nodes

export const federationNodes = sqliteTable('federation_nodes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  siteId: text('site_id').notNull(),
  name: text('name').notNull(),
  hostname: text('hostname'),
  osInfo: text('os_info'),
  agentVersion: text('agent_version'),
  status: text('status', { enum: ['pending', 'connected', 'offline', 'revoked'] }).notNull().default('pending'),
  configVersionApplied: integer('config_version_applied').default(0),
  configVersionDesired: integer('config_version_desired').default(0),
  enrolledAt: integer('enrolled_at', { mode: 'timestamp' }),
  lastHeartbeatAt: integer('last_heartbeat_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const nodeEnrollmentTokens = sqliteTable('node_enrollment_tokens', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  siteId: text('site_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdByUserId: text('created_by_user_id'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const nodeAuthKeys = sqliteTable('node_auth_keys', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  nodeId: text('node_id').notNull(),
  keyHash: text('key_hash').notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type FederationNodeRow = typeof federationNodes.$inferSelect
export type NodeEnrollmentTokenRow = typeof nodeEnrollmentTokens.$inferSelect
export type NodeAuthKeyRow = typeof nodeAuthKeys.$inferSelect

// Phase 9 — Traffic intelligence

export const routeRules = sqliteTable('route_rules', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull(),
  priority: integer('priority').notNull().default(0),
  matcherType: text('matcher_type', { enum: ['path', 'header', 'query', 'method'] }).notNull(),
  matcherKey: text('matcher_key'),
  matcherValue: text('matcher_value').notNull(),
  action: text('action', { enum: ['upstream', 'redirect', 'static'] }).notNull().default('upstream'),
  upstream: text('upstream'),
  redirectUrl: text('redirect_url'),
  staticBody: text('static_body'),
  staticStatus: integer('static_status'),
  enabled: integer('enabled').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const slowRequests = sqliteTable('slow_requests', {
  id: text('id').primaryKey(),
  routeId: text('route_id').notNull(),
  method: text('method'),
  path: text('path'),
  statusCode: integer('status_code'),
  latencyMs: integer('latency_ms').notNull(),
  upstreamMs: integer('upstream_ms'),
  clientIp: text('client_ip'),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
})

export type RouteRuleRow = typeof routeRules.$inferSelect
export type SlowRequestRow = typeof slowRequests.$inferSelect

// V1.1 — Service presets
export const servicePresets = sqliteTable('service_presets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  icon: text('icon'),
  defaultPort: integer('default_port').notNull(),
  upstreamProtocol: text('upstream_protocol', { enum: ['http', 'https-trusted', 'https-insecure'] as const }).notNull(),
  websocket: integer('websocket', { mode: 'boolean' }).notNull().default(false),
  suggestedSubdomain: text('suggested_subdomain'),
  healthCheckPath: text('health_check_path'),
  healthCheckExpectStatus: integer('health_check_expect_status').default(200),
  defaultHeaders: text('default_headers', { mode: 'json' }).$type<Record<string, string>>(),
  notes: text('notes'),
  builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type ServicePresetRow = typeof servicePresets.$inferSelect
export type NewServicePresetRow = typeof servicePresets.$inferInsert
