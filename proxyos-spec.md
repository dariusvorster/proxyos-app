# ProxyOS — Product Specification
**Version:** 1.0 | **Date:** April 2026 | **Author:** Darius
**Domain:** proxyos.app
**Tagline:** The reverse proxy that knows your infrastructure.

> ProxyOS is a reverse proxy management platform built on Caddy.
> One-button service exposure, native SSO toggle per route, built-in
> traffic analytics, and deep integration with the Homelab OS family.
> The UI that NPM should have been. The intelligence Traefik never had.
>
> **ProxyOS** = standalone self-hosted product (MIT)
> **ProxyOS Cloud** = managed cloud service ($9/$29/mo)
> **Homelab OS family** = integrates with Infra OS, BackupOS, MxWatch

---

## 1. The Problem

Every homelab operator runs a reverse proxy. Most run Nginx Proxy Manager.
All of them have the same complaints:

- **NPM:** Great UI for beginners. Terrible for power users. No API.
  Config lives in the database, not in files. No traffic analytics.
  SSO requires manual forward-auth configuration that breaks constantly.
- **Traefik:** Docker labels are clever until they aren't. No UI.
  Complex config, steep learning curve, zero topology awareness.
- **Caddy standalone:** Excellent engine, excellent API, no UI.
  Managing the JSON config directly is not a human interface.
- **HAProxy:** Bulletproof. Config is a 1990s DSL nobody enjoys writing.

The gap: **no reverse proxy knows anything about your infrastructure.**
They all treat "the upstream" as an IP and port. They don't know it's
a Proxmox VM, that it runs PostgreSQL, that it's protected by Authentik,
that it's backed by BackupOS, that it's monitored by Infra OS.

ProxyOS knows. It's the proxy that understands your stack.

---

## 2. Target Users

**Primary:** Homelab operators currently running NPM who want more power
without Traefik's complexity. Proxmox users who want to expose services
with zero friction.

**Secondary:** Self-hosted teams running mixed stacks (Docker, bare metal,
VMs) who need SSO on every route without per-service forward-auth config.

**Tertiary:** Infra OS and BackupOS users who want the full Homelab OS
platform with unified topology-aware routing.

**Not targeting:** CDN-scale deployments, cloud provider load balancers,
Kubernetes ingress (that's a different problem).

---

## 3. Product Tiers

| Tier | Name | Price | Notes |
|------|------|-------|-------|
| Self-hosted | ProxyOS | $0 | MIT, unlimited routes, single user |
| Cloud | ProxyOS Cloud Solo | $9/mo | Managed, up to 3 ProxyOS instances |
| Cloud | ProxyOS Cloud Teams | $29/mo | Multi-user, unlimited instances |
| Family | Homelab OS | Included | Integrated with Infra OS topology |

---

## 4. Why Caddy

Caddy is the only proxy engine where the entire product is achievable
without building a proxy from scratch.

**The JSON Admin API is everything:**
```
POST /config/apps/http/servers/main/routes
→ New route active in <50ms, zero downtime, no reload
```

Every ProxyOS action — add route, toggle SSO, update upstream,
enable rate limiting — is one API call to Caddy. The entire backend
is a typed wrapper around this API.

**Automatic HTTPS is genuinely solved:**
- Public domains: Let's Encrypt / ZeroSSL via ACME, automatic renewal
- Private/LAN domains: DNS-01 challenge via Cloudflare, Route53, or
  any of Caddy's 40+ DNS provider plugins
- Internal CA: Caddy can run its own CA for self-signed certs with
  automatic trust propagation to agents

**Zero-downtime config changes:** Caddy's config API is atomic.
Route changes apply instantly without touching other routes or
dropping connections. NPM requires a full nginx reload.

---

## 5. Architecture

```
proxyos/
├── apps/
│   └── web/                    # Next.js 15 — dashboard + API
├── packages/
│   ├── db/                     # Drizzle schema + SQLite
│   ├── api/                    # tRPC router
│   ├── caddy/                  # Caddy Admin API client (typed wrapper)
│   │   ├── client.ts           # HTTP client for Caddy JSON API
│   │   ├── config.ts           # Config builder — routes, upstreams, TLS
│   │   ├── routes.ts           # Route CRUD operations
│   │   ├── tls.ts              # Certificate management
│   │   └── types.ts            # Typed Caddy config schema
│   ├── sso/                    # SSO provider integrations
│   │   ├── authentik.ts        # Authentik forward auth
│   │   ├── authelia.ts         # Authelia forward auth
│   │   ├── keycloak.ts         # Keycloak forward auth
│   │   ├── zitadel.ts          # Zitadel forward auth
│   │   └── types.ts
│   ├── analytics/              # Traffic metrics (V1 built-in)
│   │   ├── collector.ts        # Parse Caddy structured logs
│   │   ├── aggregator.ts       # Roll up into time-series buckets
│   │   └── types.ts
│   └── types/                  # Shared TypeScript types
├── caddy/
│   └── Caddyfile.template      # Base config ProxyOS manages
├── docker-compose.yml          # Single container: Caddy + ProxyOS
└── .env.example
```

---

## 6. Single Container Deployment

Caddy and ProxyOS run in one Docker container. ProxyOS manages Caddy
via its localhost Admin API. No inter-container networking, no service
discovery complexity.

```
┌─────────────────────────────────────────────────┐
│  Docker container: proxyos                       │
│                                                   │
│  ┌─────────────────┐   ┌───────────────────────┐ │
│  │ Caddy            │   │ ProxyOS (Next.js)      │ │
│  │ :80  HTTP        │   │ :3000 Dashboard + API  │ │
│  │ :443 HTTPS       │◄──│                        │ │
│  │ :2019 Admin API  │   │ Manages Caddy via      │ │
│  │ (localhost only) │   │ localhost:2019          │ │
│  └─────────────────┘   └───────────────────────┘ │
│                                                   │
│  Volumes:                                         │
│  /data/caddy     — Caddy data (certs, ACME)      │
│  /config/caddy   — Caddy config                  │
│  /data/proxyos   — ProxyOS SQLite + logs         │
└─────────────────────────────────────────────────┘
```

**Startup sequence:**
1. Container starts
2. Caddy starts with base config (ProxyOS dashboard on :3000,
   Admin API on localhost:2019)
3. ProxyOS starts and reads persisted routes from SQLite
4. ProxyOS calls Caddy Admin API to rebuild all routes from DB
5. ProxyOS is ready — Caddy is fully configured

This means SQLite is the source of truth, not Caddy's config file.
ProxyOS always rebuilds Caddy state from its own DB on startup.

---

## 7. Database Schema

```typescript
// packages/db/schema.ts

// ── Routes ────────────────────────────────────────────────────────────────
// A route = one domain → one or more upstreams

export const routes = sqliteTable('routes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  domain: text('domain').notNull().unique(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),

  // Upstream config
  upstreamType: text('upstream_type').notNull(),
  // 'http'        — standard HTTP upstream
  // 'tcp'         — TCP passthrough (no TLS termination)
  // 'static'      — serve static files from path
  // 'redirect'    — 301/302 redirect to another URL
  // 'loadbalance' — multiple upstreams with policy
  upstreams: text('upstreams').notNull(),  // JSON array of UpstreamConfig

  // TLS config
  tlsMode: text('tls_mode').default('auto'),
  // 'auto'        — Caddy manages Let's Encrypt automatically
  // 'dns'         — DNS-01 challenge for private/wildcard domains
  // 'internal'    — Caddy internal CA (for LAN services)
  // 'custom'      — user-provided cert/key
  // 'off'         — HTTP only (not recommended)
  tlsDnsProvider: text('tls_dns_provider'),  // 'cloudflare' | 'route53' | ...
  tlsDnsCredentials: text('tls_dns_credentials'), // JSON, encrypted

  // SSO config
  ssoEnabled: integer('sso_enabled', { mode: 'boolean' }).default(false),
  ssoProviderId: text('sso_provider_id').references(() => ssoProviders.id),
  ssoBypassPaths: text('sso_bypass_paths'),  // JSON array of path patterns

  // Access control
  accessPolicy: text('access_policy'),       // JSON — AllowList | DenyList | None
  ipAllowlist: text('ip_allowlist'),          // JSON array of CIDR ranges
  basicAuth: text('basic_auth'),             // JSON, encrypted — { user, password }
  rateLimit: text('rate_limit'),             // JSON — { requests, window }

  // Advanced
  headers: text('headers'),                  // JSON — request/response header mods
  rewriteRules: text('rewrite_rules'),       // JSON array of RewriteRule
  websocketEnabled: integer('websocket_enabled', { mode: 'boolean' }).default(true),
  http2Enabled: integer('http2_enabled', { mode: 'boolean' }).default(true),
  http3Enabled: integer('http3_enabled', { mode: 'boolean' }).default(true),
  compressionEnabled: integer('compression_enabled', { mode: 'boolean' }).default(true),
  bufferRequests: integer('buffer_requests', { mode: 'boolean' }).default(false),

  // Health check
  healthCheckEnabled: integer('health_check_enabled', { mode: 'boolean' }).default(true),
  healthCheckPath: text('health_check_path').default('/'),
  healthCheckInterval: integer('health_check_interval').default(30),

  // Infra OS integration
  infraOsNodeId: text('infra_os_node_id'),  // linked Infra OS node
  infraOsServiceId: text('infra_os_service_id'),

  // Metadata
  tags: text('tags'),                        // JSON array
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ── SSO Providers ─────────────────────────────────────────────────────────

export const ssoProviders = sqliteTable('sso_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),           // 'authentik' | 'authelia' | 'keycloak' | 'zitadel'
  forwardAuthUrl: text('forward_auth_url').notNull(),
  // e.g. https://auth.homelab.com/outpost.goauthentik.io/auth/caddy
  authResponseHeaders: text('auth_response_headers'), // JSON array — headers to pass through
  trustedIPs: text('trusted_ips'),        // JSON array — IPs that bypass auth
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  lastTestedAt: integer('last_tested_at', { mode: 'timestamp' }),
  testStatus: text('test_status'),        // 'ok' | 'error' | 'unknown'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Certificates ──────────────────────────────────────────────────────────

export const certificates = sqliteTable('certificates', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull(),
  source: text('source').notNull(),       // 'acme_le' | 'acme_zerossl' | 'dns01' | 'internal' | 'custom'
  status: text('status').notNull(),       // 'active' | 'renewing' | 'expired' | 'error'
  issuedAt: integer('issued_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  autoRenew: integer('auto_renew', { mode: 'boolean' }).default(true),
  lastRenewedAt: integer('last_renewed_at', { mode: 'timestamp' }),
  routeId: text('route_id').references(() => routes.id),
})

// ── DNS Providers ─────────────────────────────────────────────────────────
// For DNS-01 challenge on private/wildcard domains

export const dnsProviders = sqliteTable('dns_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),           // 'cloudflare' | 'route53' | 'porkbun' | ...
  credentials: text('credentials').notNull(), // JSON, encrypted
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Traffic metrics (V1 built-in) ────────────────────────────────────────

export const trafficMetrics = sqliteTable('traffic_metrics', {
  id: text('id').primaryKey(),
  routeId: text('route_id').references(() => routes.id),
  bucket: text('bucket').notNull(),       // '1m' | '1h' | '1d' — pre-aggregated
  requests: integer('requests').notNull(),
  bytes: integer('bytes').notNull(),
  errors: integer('errors').notNull(),
  p50LatencyMs: integer('p50_latency_ms'),
  p95LatencyMs: integer('p95_latency_ms'),
  p99LatencyMs: integer('p99_latency_ms'),
  status2xx: integer('status_2xx'),
  status3xx: integer('status_3xx'),
  status4xx: integer('status_4xx'),
  status5xx: integer('status_5xx'),
  topIps: text('top_ips'),               // JSON — top 5 source IPs + counts
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
})

// ── Access log ────────────────────────────────────────────────────────────
// Recent requests per route — ring buffer, keep last 1000 per route

export const accessLog = sqliteTable('access_log', {
  id: text('id').primaryKey(),
  routeId: text('route_id').references(() => routes.id),
  method: text('method'),
  path: text('path'),
  statusCode: integer('status_code'),
  latencyMs: integer('latency_ms'),
  bytesIn: integer('bytes_in'),
  bytesOut: integer('bytes_out'),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
})

// ── Audit log ─────────────────────────────────────────────────────────────

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  resourceName: text('resource_name'),
  actor: text('actor').default('user'),
  detail: text('detail'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ── Alert rules ───────────────────────────────────────────────────────────

export const alertRules = sqliteTable('alert_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  // 'upstream_down'     — health check failed
  // 'error_rate_spike'  — 5xx rate > threshold
  // 'latency_spike'     — p95 > threshold
  // 'cert_expiring'     — cert expires in < N days
  // 'traffic_spike'     — requests/min > threshold
  targetRouteId: text('target_route_id'), // null = all routes
  config: text('config').notNull(),        // JSON — thresholds + channels
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  lastFiredAt: integer('last_fired_at', { mode: 'timestamp' }),
})
```

---

## 8. Caddy API Client (`packages/caddy/`)

```typescript
// packages/caddy/client.ts

export class CaddyClient {
  private readonly baseUrl = 'http://localhost:2019'

  // ── Config ───────────────────────────────────────────────────────────
  async getConfig(): Promise<CaddyConfig>
  async setConfig(config: CaddyConfig): Promise<void>
  async patchConfig(path: string, value: unknown): Promise<void>

  // ── Routes ───────────────────────────────────────────────────────────
  async getRoutes(): Promise<CaddyRoute[]>
  async addRoute(route: CaddyRoute): Promise<void>
  async updateRoute(routeId: string, route: CaddyRoute): Promise<void>
  async removeRoute(routeId: string): Promise<void>

  // ── TLS ──────────────────────────────────────────────────────────────
  async getCertificates(): Promise<CaddyCert[]>
  async loadCert(cert: string, key: string): Promise<void>
  async revokeCert(domain: string): Promise<void>

  // ── PKI (internal CA) ────────────────────────────────────────────────
  async getRootCA(): Promise<string>  // PEM — for agent trust distribution

  // ── Health ───────────────────────────────────────────────────────────
  async health(): Promise<{ status: 'ok' }>
  async getUpstreams(): Promise<CaddyUpstream[]>  // health of all upstreams
}
```

```typescript
// packages/caddy/config.ts — Route builder

export function buildCaddyRoute(route: Route, ssoProvider?: SSOProvider): CaddyRoute {
  const matchers = [{ host: [route.domain] }]
  const handlers: CaddyHandler[] = []

  // SSO forward auth — prepended before upstream handler
  if (route.ssoEnabled && ssoProvider) {
    handlers.push({
      handler: 'forward_auth',
      uri: ssoProvider.forwardAuthUrl,
      copy_headers: JSON.parse(ssoProvider.authResponseHeaders ?? '[]'),
    })
  }

  // Rate limiting
  if (route.rateLimit) {
    const rl = JSON.parse(route.rateLimit)
    handlers.push({
      handler: 'rate_limit',
      zone: { key: '{remote_host}', events: rl.requests, window: rl.window },
    })
  }

  // Header modifications
  if (route.headers) {
    handlers.push({
      handler: 'headers',
      ...JSON.parse(route.headers),
    })
  }

  // Compression
  if (route.compressionEnabled) {
    handlers.push({ handler: 'encode', encodings: { gzip: {}, zstd: {} } })
  }

  // Upstream reverse proxy
  const upstreams = JSON.parse(route.upstreams)
  handlers.push({
    handler: 'reverse_proxy',
    upstreams: upstreams.map((u: UpstreamConfig) => ({ dial: u.address })),
    load_balancing: upstreams.length > 1
      ? { selection_policy: { policy: 'least_conn' } }
      : undefined,
    health_checks: route.healthCheckEnabled ? {
      active: {
        path: route.healthCheckPath,
        interval: `${route.healthCheckInterval}s`,
        timeout: '5s',
      }
    } : undefined,
  })

  return {
    match: matchers,
    handle: handlers,
    terminal: true,
  }
}
```

---

## 9. One-Button Expose Flow

The visual equivalent of `ios expose`. User clicks a node in the
topology (imported from Infra OS) or enters an IP manually, picks
a domain, toggles SSO, and clicks "Expose". ProxyOS does the rest.

```typescript
// packages/api/expose.ts

export async function exposeService(input: ExposeInput): Promise<ExposeResult> {
  const {
    name,
    upstreamUrl,    // e.g. http://192.168.69.30:11434
    domain,         // e.g. ai.gitbay.dev
    tlsMode,        // 'auto' | 'dns' | 'internal'
    dnsChallengeProviderId,
    ssoEnabled,
    ssoProviderId,
    infraOsNodeId,
    infraOsServiceId,
  } = input

  // 1. Validate domain not already in use
  const existing = await db.query.routes.findFirst({
    where: eq(routes.domain, domain)
  })
  if (existing) throw new TRPCError({ code: 'CONFLICT', message: `${domain} already has a route` })

  // 2. Build the Caddy route config
  const ssoProvider = ssoEnabled
    ? await db.query.ssoProviders.findFirst({ where: eq(ssoProviders.id, ssoProviderId!) })
    : undefined

  const caddyRoute = buildCaddyRoute({
    domain,
    upstreams: JSON.stringify([{ address: upstreamUrl.replace('http://', '').replace('https://', '') }]),
    ssoEnabled: ssoEnabled ?? false,
    tlsMode,
    healthCheckEnabled: true,
    healthCheckPath: '/',
    compressionEnabled: true,
    websocketEnabled: true,
    http2Enabled: true,
    http3Enabled: true,
  } as Route, ssoProvider ?? undefined)

  // 3. Push to Caddy — instant, zero downtime
  await caddyClient.addRoute(caddyRoute)

  // 4. Persist to DB
  const routeId = nanoid()
  await db.insert(routes).values({
    id: routeId,
    name,
    domain,
    enabled: true,
    upstreamType: 'http',
    upstreams: JSON.stringify([{ address: upstreamUrl }]),
    tlsMode,
    tlsDnsProvider: tlsMode === 'dns' ? dnsChallengeProviderId : null,
    ssoEnabled: ssoEnabled ?? false,
    ssoProviderId: ssoEnabled ? ssoProviderId : null,
    healthCheckEnabled: true,
    healthCheckPath: '/',
    websocketEnabled: true,
    http2Enabled: true,
    http3Enabled: true,
    compressionEnabled: true,
    infraOsNodeId,
    infraOsServiceId,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // 5. Write audit log
  await db.insert(auditLog).values({
    id: nanoid(),
    action: 'expose',
    resourceType: 'route',
    resourceId: routeId,
    resourceName: domain,
    actor: 'user',
    detail: JSON.stringify({ upstreamUrl, ssoEnabled, tlsMode }),
    createdAt: new Date(),
  })

  return {
    success: true,
    routeId,
    domain,
    url: `https://${domain}`,
    ssoEnabled: ssoEnabled ?? false,
    certStatus: 'provisioning', // Caddy handles this automatically
  }
}
```

---

## 10. SSO Integration (`packages/sso/`)

The SSO toggle is the feature NPM users want most and have never had.
ProxyOS makes it a single boolean per route.

```typescript
// packages/sso/authentik.ts

export class AuthentikSSO {
  readonly type = 'authentik'

  // Generates the forward_auth URL for this Authentik instance
  // User just points ProxyOS at their Authentik URL and ProxyOS
  // builds the correct forward auth endpoint automatically
  buildForwardAuthUrl(authentikBaseUrl: string): string {
    return `${authentikBaseUrl}/outpost.goauthentik.io/auth/caddy`
  }

  // Headers Authentik sets after successful auth — ProxyOS passes
  // these to the upstream so apps can use the user identity
  defaultResponseHeaders(): string[] {
    return [
      'X-authentik-username',
      'X-authentik-groups',
      'X-authentik-email',
      'X-authentik-name',
      'X-authentik-uid',
    ]
  }

  // Test the SSO provider is reachable and responding
  async test(forwardAuthUrl: string): Promise<{ ok: boolean; latencyMs: number }>
}
```

**The Caddy forward_auth handler ProxyOS generates:**
```json
{
  "handler": "forward_auth",
  "uri": "https://auth.homelab.com/outpost.goauthentik.io/auth/caddy",
  "copy_headers": [
    "X-authentik-username",
    "X-authentik-groups",
    "X-authentik-email"
  ]
}
```

This is what NPM users have to configure manually — raw nginx
`auth_request` directives, header passing, redirect handling.
ProxyOS generates it from a single toggle.

---

## 11. Traffic Analytics (`packages/analytics/`)

```typescript
// packages/analytics/collector.ts
// Parses Caddy's structured JSON access logs

// Caddy log format configured in base Caddyfile:
// log { output file /data/proxyos/access.log { roll_size 100mb }
//       format json }

export async function processLogLine(line: string): Promise<void> {
  const entry = JSON.parse(line) as CaddyLogEntry

  // Extract route ID from the request host
  const route = await db.query.routes.findFirst({
    where: eq(routes.domain, entry.request.host)
  })
  if (!route) return

  // Write to access_log (ring buffer — delete oldest when > 1000 per route)
  await db.insert(accessLog).values({
    id: nanoid(),
    routeId: route.id,
    method: entry.request.method,
    path: entry.request.uri,
    statusCode: entry.status,
    latencyMs: Math.round(entry.duration * 1000),
    bytesIn: entry.request.headers_size,
    bytesOut: entry.size,
    clientIp: entry.request.remote_ip,
    userAgent: entry.request.headers['User-Agent']?.[0],
    recordedAt: new Date(entry.ts * 1000),
  })

  // Aggregate into 1-minute buckets for charting
  await upsertMetricsBucket(route.id, '1m', entry)
}
```

```typescript
// packages/analytics/aggregator.ts

export async function upsertMetricsBucket(
  routeId: string,
  bucket: '1m' | '1h' | '1d',
  entry: CaddyLogEntry,
): Promise<void> {
  const bucketTime = getBucketTime(entry.ts, bucket)

  // Upsert — increment counters for this bucket
  // SQLite doesn't have upsert-with-increment natively,
  // so we use a read-modify-write with a transaction
  await db.transaction(async (tx) => {
    const existing = await tx.query.trafficMetrics.findFirst({
      where: and(
        eq(trafficMetrics.routeId, routeId),
        eq(trafficMetrics.bucket, bucket),
        eq(trafficMetrics.recordedAt, bucketTime),
      )
    })

    if (existing) {
      await tx.update(trafficMetrics)
        .set({
          requests: existing.requests + 1,
          bytes: existing.bytes + entry.size,
          errors: existing.errors + (entry.status >= 500 ? 1 : 0),
          status2xx: existing.status2xx! + (entry.status < 300 ? 1 : 0),
          status4xx: existing.status4xx! + (entry.status >= 400 && entry.status < 500 ? 1 : 0),
          status5xx: existing.status5xx! + (entry.status >= 500 ? 1 : 0),
        })
        .where(eq(trafficMetrics.id, existing.id))
    } else {
      await tx.insert(trafficMetrics).values({
        id: nanoid(),
        routeId,
        bucket,
        requests: 1,
        bytes: entry.size,
        errors: entry.status >= 500 ? 1 : 0,
        status2xx: entry.status < 300 ? 1 : 0,
        status3xx: entry.status >= 300 && entry.status < 400 ? 1 : 0,
        status4xx: entry.status >= 400 && entry.status < 500 ? 1 : 0,
        status5xx: entry.status >= 500 ? 1 : 0,
        recordedAt: bucketTime,
      })
    }
  })
}

// Rollup job (node-cron) — every hour, aggregate 1m → 1h
// Every day, aggregate 1h → 1d
// Retention: keep 1m for 24h, 1h for 30d, 1d for 1yr
```

---

## 12. tRPC Router

```typescript
export const appRouter = router({

  health: publicProcedure.query(() => ({ ok: true, version: PKG_VERSION })),

  // ── Routes ──────────────────────────────────────────────────────────
  routes: router({
    list:    authedProcedure.query(/* all routes + status + last traffic */),
    get:     authedProcedure.input(z.object({ id: z.string() })).query(/* full detail */),
    expose:  authedProcedure.input(ExposeSchema).mutation(/* one-button expose */),
    update:  authedProcedure.input(RouteUpdateSchema).mutation(/* patch route, applies to Caddy immediately */),
    toggle:  authedProcedure.input(z.object({ id: z.string(), enabled: z.boolean() })).mutation(/* enable/disable */),
    delete:  authedProcedure.input(z.object({ id: z.string() })).mutation(/* remove from Caddy + DB */),
    test:    authedProcedure.input(z.object({ id: z.string() })).mutation(/* HTTP probe upstream */),
    // Import from Infra OS topology — pre-populates the expose form
    importFromInfraOS: authedProcedure.input(z.object({
      nodeId: z.string(),
      serviceId: z.string().optional(),
    })).query(/* returns suggested ExposeInput from Infra OS data */),
  }),

  // ── SSO providers ────────────────────────────────────────────────────
  sso: router({
    list:   authedProcedure.query(/* all SSO providers */),
    create: authedProcedure.input(SSOProviderSchema).mutation(/* */),
    test:   authedProcedure.input(z.object({ id: z.string() })).mutation(/* probe forward auth URL */),
    update: authedProcedure.input(SSOProviderUpdateSchema).mutation(/* */),
    delete: authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
  }),

  // ── Certificates ─────────────────────────────────────────────────────
  certs: router({
    list:   authedProcedure.query(/* all certs with expiry + source */),
    check:  authedProcedure.mutation(/* probe all certs for expiry */),
    renew:  authedProcedure.input(z.object({ domain: z.string() })).mutation(/* force ACME renewal */),
    upload: authedProcedure.input(z.object({ cert: z.string(), key: z.string(), domain: z.string() })).mutation(/* custom cert */),
  }),

  // ── DNS providers ─────────────────────────────────────────────────────
  dns: router({
    list:   authedProcedure.query(/* */),
    create: authedProcedure.input(DNSProviderSchema).mutation(/* */),
    test:   authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
    delete: authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
  }),

  // ── Analytics ────────────────────────────────────────────────────────
  analytics: router({
    summary:   authedProcedure.query(/* total requests, bytes, error rate across all routes, last 24h */),
    byRoute:   authedProcedure.input(z.object({ routeId: z.string(), period: z.string(), bucket: z.string() })).query(/* */),
    topRoutes: authedProcedure.query(/* top 10 routes by traffic */),
    errors:    authedProcedure.query(/* recent 5xx errors across all routes */),
    accessLog: authedProcedure.input(z.object({ routeId: z.string(), limit: z.number().default(50) })).query(/* */),
    realtime:  authedProcedure.subscription(/* live access log stream */),
  }),

  // ── Alerts ───────────────────────────────────────────────────────────
  alerts: router({
    rules: router({
      list:   authedProcedure.query(/* */),
      upsert: authedProcedure.input(AlertRuleSchema).mutation(/* */),
      delete: authedProcedure.input(z.object({ id: z.string() })).mutation(/* */),
    }),
    history: authedProcedure.query(/* last 100 fired alerts */),
  }),

  // ── Caddy ────────────────────────────────────────────────────────────
  caddy: router({
    status:   authedProcedure.query(/* Caddy health + version + upstreams */),
    reload:   authedProcedure.mutation(/* rebuild all Caddy config from DB */),
    config:   authedProcedure.query(/* raw Caddy JSON config — for debugging */),
    rootCA:   authedProcedure.query(/* Caddy internal CA cert for distribution */),
  }),

  // ── Dashboard ────────────────────────────────────────────────────────
  dashboard: router({
    summary: authedProcedure.query(/*
      total routes, healthy/unhealthy split,
      total requests 24h, total bytes 24h,
      error rate 24h, certs expiring <30d
    */),
  }),

  // ── Audit ────────────────────────────────────────────────────────────
  audit: router({
    list: authedProcedure.input(z.object({ limit: z.number().default(50) })).query(/* */),
  }),
})
```

---

## 13. Web App Pages

```
apps/web/app/
├── (auth)/
│   └── login/page.tsx
├── (dashboard)/
│   ├── layout.tsx                   # App shell — sidebar + topbar
│   ├── page.tsx                     # → /dashboard
│   │
│   ├── dashboard/page.tsx           # Overview — route grid, traffic charts,
│   │                                # cert expiry, upstream health
│   │
│   ├── routes/
│   │   ├── page.tsx                 # Route list — domain, upstream, status,
│   │   │                            # SSO badge, traffic sparkline
│   │   ├── new/page.tsx             # Expose wizard (the hero feature)
│   │   └── [id]/
│   │       ├── page.tsx             # Route detail — config, SSO, access control
│   │       ├── analytics/page.tsx   # Traffic charts, latency, error rate
│   │       └── logs/page.tsx        # Access log + live tail
│   │
│   ├── sso/
│   │   ├── page.tsx                 # SSO provider list + status
│   │   └── [id]/page.tsx            # Provider detail + test
│   │
│   ├── certificates/page.tsx        # All certs, expiry timeline, renew
│   │
│   ├── analytics/page.tsx           # Cross-route analytics dashboard
│   │                                # Top routes, error rates, traffic trends
│   │
│   └── settings/
│       ├── page.tsx
│       ├── dns/page.tsx             # DNS challenge providers
│       ├── notifications/page.tsx   # Alert channels
│       ├── tokens/page.tsx          # API token management
│       └── caddy/page.tsx           # Caddy config viewer + reload
```

---

## 14. Expose Wizard UX

The most important flow in the product. Five steps, no friction.

```
Step 1 — Source
  ┌─────────────────────────────────────────────────────┐
  │ Where is the service?                                │
  │                                                      │
  │ [Enter IP:port manually]    [Import from Infra OS]   │
  │                                                      │
  │  If "Import from Infra OS" selected:                 │
  │  Shows topology node picker with search              │
  │  Auto-fills upstream URL from node IP + port         │
  └─────────────────────────────────────────────────────┘

Step 2 — Domain
  ┌─────────────────────────────────────────────────────┐
  │ What domain?                                         │
  │                                                      │
  │ Domain: [gitbay.dev_______________________________]  │
  │                                                      │
  │ TLS:  ● Auto (Let's Encrypt)                         │
  │       ○ DNS challenge (private/wildcard domains)     │
  │       ○ Internal CA (LAN only)                       │
  │       ○ Custom certificate                           │
  └─────────────────────────────────────────────────────┘

Step 3 — Access control
  ┌─────────────────────────────────────────────────────┐
  │ Who can access this?                                 │
  │                                                      │
  │ SSO  [toggle ●──────]  via Authentik                 │
  │      Provider: [homelab-authentik ▾]                 │
  │                                                      │
  │ IP allowlist  [toggle ○──────]                       │
  │ Basic auth    [toggle ○──────]                       │
  │ Public        [toggle ○──────]                       │
  └─────────────────────────────────────────────────────┘

Step 4 — Options (collapsed by default)
  ┌─────────────────────────────────────────────────────┐
  │ Advanced (optional)                          [▾]     │
  │                                                      │
  │ Rate limiting    ○ off  ● on  [100 req/min]          │
  │ Compression      ● gzip + zstd                       │
  │ WebSocket        ● enabled                           │
  │ HTTP/3           ● enabled                           │
  │ Health check     ● /  every 30s                      │
  └─────────────────────────────────────────────────────┘

Step 5 — Review + expose
  ┌─────────────────────────────────────────────────────┐
  │ Review                                               │
  │                                                      │
  │ https://gitbay.dev                                   │
  │   → http://192.168.55.20:3000                        │
  │   TLS: Let's Encrypt (auto-renew)                    │
  │   SSO: Authentik · homelab-authentik                 │
  │   Rate limit: 100 req/min per IP                     │
  │                                                      │
  │ [← back]              [Expose now →]                 │
  └─────────────────────────────────────────────────────┘

After "Expose now":
  ✓ Route added to Caddy (live in <50ms)
  ✓ Certificate provisioning started
  ✓ SSO forward auth configured
  ✓ Saved to ProxyOS database
  → https://gitbay.dev is live
```

---

## 15. Infra OS Integration

```typescript
// infraos/packages/integrations/proxy/proxyos.ts

export class ProxyOSAdapter implements IntegrationAdapter {
  readonly id = 'proxyos'
  readonly category = 'proxy' as const
  readonly displayName = 'ProxyOS'

  async sync(config: IntegrationConfig): Promise<SyncResult> {
    // GET {proxyos_url}/api/trpc/routes.list
    // Maps ProxyOS routes → Infra OS tunnelRoutes table
    // Domain, upstream, SSO status all visible in Infra OS topology
  }
}
```

**Infra OS topology with ProxyOS:**
```
gitbay-dev (VM 101)
  ├── CPU 22% · RAM 41% · ● running
  ├── gitbay.dev
  │     ProxyOS → 192.168.55.20:3000
  │     TLS: Let's Encrypt ✓ expires 89d
  │     SSO: Authentik ✓
  │     Traffic: 1.2k req/24h · p95 42ms
  └── Backup: ● 2h ago · BackupOS
```

**`ios expose` routes through ProxyOS (when integrated):**
```bash
ios expose gitbay --port 3000 --domain gitbay.dev --sso

# Without ProxyOS: provisions Cloudflare tunnel + DNS + Authentik
# With ProxyOS:    provisions ProxyOS route + Cloudflare DNS + Authentik
# User doesn't need to know — ios detects which proxy is configured
```

---

## 16. Docker Deployment

```yaml
# docker-compose.yml

services:
  proxyos:
    image: ghcr.io/yourusername/proxyos:latest
    container_name: proxyos
    restart: unless-stopped
    ports:
      - "80:80"        # HTTP (redirects to HTTPS)
      - "443:443"      # HTTPS
      - "443:443/udp"  # HTTP/3 (QUIC)
      - "3000:3000"    # ProxyOS dashboard (consider putting behind ProxyOS itself)
    volumes:
      - proxyos_caddy_data:/data/caddy    # Caddy certs + ACME state
      - proxyos_caddy_config:/config/caddy
      - proxyos_data:/data/proxyos        # SQLite + access logs
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - RESEND_API_KEY=${RESEND_API_KEY}
      # Caddy admin API — always localhost, never exposed
      - CADDY_ADMIN_URL=http://localhost:2019
    cap_add:
      - NET_BIND_SERVICE  # Allow binding to ports 80/443 as non-root

volumes:
  proxyos_caddy_data:
  proxyos_caddy_config:
  proxyos_data:
```

**Note on the dashboard port:** Once ProxyOS is running, you can add a
route to serve the ProxyOS dashboard itself at a proper domain
(e.g., `proxy.homelab.com`) with SSO protection. The 3000 port can
then be firewalled. Bootstrapping exception: port 3000 stays open until
you've added that route.

---

## 17. V1 MVP Scope

### Build in V1
- [ ] Single Docker container (Caddy + ProxyOS)
- [ ] Caddy Admin API typed client
- [ ] Route management — add, edit, toggle, delete
- [ ] **One-button expose wizard** (5-step, the hero feature)
- [ ] TLS modes: auto (Let's Encrypt), DNS-01, internal CA, custom
- [ ] DNS challenge providers: Cloudflare V1, Route53 V2
- [ ] **SSO toggle per route**: Authentik, Authelia (V1), Keycloak stub
- [ ] Rate limiting per route
- [ ] IP allowlist per route
- [ ] Built-in traffic analytics (SQLite time-series)
- [ ] Access log viewer + live tail
- [ ] Certificate management + expiry alerts
- [ ] Upstream health checks
- [ ] WebSocket, HTTP/2, HTTP/3, compression — all on by default
- [ ] Alert rules: upstream_down, cert_expiring, error_rate_spike
- [ ] Email alerts via Resend
- [ ] Infra OS adapter (ProxyOS → Infra OS topology)
- [ ] Dashboard, Routes, SSO, Certificates, Analytics pages

### Defer to V2
- [ ] Load balancing UI (multiple upstreams per route)
- [ ] Prometheus metrics exporter
- [ ] TCP/UDP passthrough routes
- [ ] Wildcard routes (*.domain.com)
- [ ] Request/response body rewriting
- [ ] Geographic IP blocking
- [ ] Full Keycloak + Zitadel SSO providers
- [ ] ProxyOS Cloud
- [ ] Multi-user / Teams plan
- [ ] `ios expose` routing through ProxyOS

---

## 18. Environment Variables

```env
DATABASE_URL=file:./data/proxyos.db
ENCRYPTION_KEY=change-me-32-chars-minimum
BETTER_AUTH_SECRET=change-me-32-chars-minimum
NEXTAUTH_URL=http://localhost:3000

# Caddy Admin API (always localhost in single-container deploy)
CADDY_ADMIN_URL=http://localhost:2019

# Caddy access log path (ProxyOS reads this for analytics)
CADDY_ACCESS_LOG_PATH=/data/proxyos/access.log

# Alerts
RESEND_API_KEY=

# Infra OS integration (optional)
INFRAOS_URL=http://infraos.local:3000
INFRAOS_API_TOKEN=
```

---

## 19. Claude Code Kickoff Prompt

```
You are building ProxyOS — a reverse proxy management platform
built on Caddy.

ProxyOS has three layers:
1. A Caddy Admin API wrapper — typed client for all Caddy operations
2. A route management layer — the ProxyOS database and business logic
3. A UI layer — the dashboard, expose wizard, and analytics

Read proxyos-spec.md completely before writing any code.
The spec is the source of truth. Do not deviate without asking.

Tech stack:
- Next.js 15 App Router + TypeScript
- tRPC v11
- Drizzle ORM — SQLite (self-hosted)
- better-auth email/password
- Tailwind CSS v4 + shadcn/ui
- Dark theme: bg #0B0E14, accent blue #4A9EFF
- JetBrains Mono headings + Outfit body
- pnpm + turborepo
- Single Docker container: Caddy + ProxyOS (Node.js)

CRITICAL architecture decision:
- Caddy Admin API listens on localhost:2019 (never exposed externally)
- ProxyOS is the ONLY thing that writes to Caddy config
- SQLite is the source of truth — ProxyOS rebuilds Caddy state from
  DB on every startup via caddy.reload mutation
- Never write Caddyfile templates — always use the JSON Admin API

Build in this order. Confirm after each step:

STEP 1 — Monorepo scaffold
  apps/web
  packages/db, packages/api, packages/caddy, packages/sso,
  packages/analytics, packages/types

STEP 2 — Database schema (packages/db)
  Full schema: routes, ssoProviders, certificates, dnsProviders,
  trafficMetrics, accessLog, alertRules, auditLog

STEP 3 — Caddy client (packages/caddy)
  CaddyClient class — typed HTTP client for localhost:2019
  buildCaddyRoute() — converts ProxyOS route → Caddy JSON config
  All route operations: add, update, remove, list
  TLS operations: getCerts, loadCert, revokeCert, getRootCA

STEP 4 — SSO integrations (packages/sso)
  AuthentikSSO: buildForwardAuthUrl(), defaultResponseHeaders(), test()
  AutheliaSSO: same interface
  Stub: KeycloakSSO, ZitadelSSO

STEP 5 — Analytics (packages/analytics)
  processLogLine() — parse Caddy JSON access log entries
  upsertMetricsBucket() — aggregate into 1m/1h/1d buckets
  Log tail watcher — fs.watch on access log file, process new lines

STEP 6 — tRPC router (packages/api)
  All routers from spec.
  exposeService() is the most important mutation — wire it completely.
  caddy.reload rebuilds all routes from DB — test this on startup.

STEP 7 — Web app shell + core pages
  Dark sidebar with blue accent.
  Sidebar: Dashboard, Routes, SSO, Certificates, Analytics, Settings.
  /dashboard — route grid with health dots, traffic sparklines,
               cert expiry widget
  /routes — route list with SSO badge, status, traffic column
  /routes/new — the 5-step expose wizard (spec section 14 exactly)
  /sso — provider list + test button
  /certificates — cert list with expiry timeline
  /analytics — cross-route traffic dashboard with charts

STEP 8 — Docker setup
  Dockerfile: Caddy + Node.js in one image
  Startup script: start Caddy, then start ProxyOS
  ProxyOS calls caddy.reload on startup to rebuild state
  docker-compose.yml per spec

After each step: tsc --noEmit, fix all type errors before proceeding.
Ask before adding any dependency not in the spec.
```
