# ProxyOS — V3 Feature Spec
## "ProxyOS Connect" — Own the Whole Chain

**Version:** 3.0 Draft  
**Date:** April 2026  
**Status:** Pre-implementation spec  
**Builds on:** V1 (core proxy), V2 (federation + import + scanner)

---

## The V3 Thesis

V1 made ProxyOS "Caddy with a good UI."  
V2 made it "Caddy with federation and migration."  
V3 makes it the **exposure layer control plane** — the single place that manages every component in the chain from DNS record to upstream service.

Today that chain looks like this:

```
[Cloudflare DNS]  ←  managed in Cloudflare dashboard
      ↓
[Cloudflare Tunnel]  ←  managed in cloudflared config files
      ↓
[ProxyOS / Caddy]  ←  managed in ProxyOS  ✓
      ↓
[Authentik SSO]  ←  managed in Authentik dashboard
      ↓
[Upstream service]  ←  managed wherever
```

V3 collapses the whole chain into ProxyOS. One button exposes a service end-to-end. One view shows the entire chain health. One place to debug when something breaks.

**New capability name:** **ProxyOS Connect**

---

## Table of Contents

1. [ProxyOS Connect — Architecture](#1-proxyos-connect--architecture)
2. [Connections: Cloudflare](#2-connections-cloudflare)
3. [Connections: Identity Providers](#3-connections-identity-providers)
4. [Connections: DNS Providers](#4-connections-dns-providers)
5. [Connections: Tunnel Providers](#5-connections-tunnel-providers)
6. [Connections: Monitoring](#6-connections-monitoring)
7. [Connections: Notification Channels](#7-connections-notification-channels)
8. [Service Chain View](#8-service-chain-view)
9. [V3 Expose Wizard — Full Chain](#9-v3-expose-wizard--full-chain)
10. [Traffic Intelligence](#10-traffic-intelligence)
11. [Security Layer](#11-security-layer)
12. [Observability Upgrades](#12-observability-upgrades)
13. [Certificate Intelligence](#13-certificate-intelligence)
14. [Developer & Automation](#14-developer--automation)
15. [Teams & Multi-tenancy](#15-teams--multi-tenancy)
16. [Homelab OS Family Integrations](#16-homelab-os-family-integrations)
17. [Database Schema Additions](#17-database-schema-additions)
18. [API Surface Additions](#18-api-surface-additions)
19. [Monorepo Changes](#19-monorepo-changes)
20. [Build Order](#20-build-order)

---

---

## 1. ProxyOS Connect — Architecture

### Concept

ProxyOS Connect is a unified adapter system. Each external service (Cloudflare, Authentik, Uptime Kuma, etc.) is a **Connection** — a configured integration with credentials, sync state, and an adapter that translates ProxyOS actions into that service's API calls.

When a route is created, updated, or deleted in ProxyOS, it fires events to all relevant Connection adapters. Each adapter handles its own API calls independently and asynchronously. If an adapter fails, the route is still created in Caddy — external service failures are non-blocking.

### Connection adapter interface

```typescript
// packages/connect/types.ts

interface ConnectionAdapter {
  id: string
  type: ConnectionType
  name: string                          // user-assigned label e.g. "Cloudflare homelabza.com"
  credentials: EncryptedCredentials
  status: 'connected' | 'error' | 'disconnected'
  lastSync?: Date

  // Lifecycle
  test(): Promise<ConnectionTestResult>
  sync(): Promise<SyncResult>           // pull remote state → local

  // Route hooks (called by ProxyOS event bus)
  onRouteCreated?(route: Route): Promise<void>
  onRouteUpdated?(route: Route, prev: Route): Promise<void>
  onRouteDeleted?(route: Route): Promise<void>

  // Chain status (for service chain view)
  getChainNodes(route: Route): Promise<ChainNode[]>
}

type ConnectionType =
  | 'cloudflare'
  | 'authentik'
  | 'authelia'
  | 'keycloak'
  | 'zitadel'
  | 'cloudflare_tunnel'
  | 'tailscale_funnel'
  | 'route53'
  | 'hetzner_dns'
  | 'namecheap'
  | 'uptime_kuma'
  | 'betterstack'
  | 'freshping'
  | 'slack'
  | 'zulip'
  | 'smtp'
  | 'webhook'
  | 'infra_os'
  | 'backup_os'
  | 'lock_box_os'
  | 'patch_os'
```

### Event bus

ProxyOS V3 introduces an internal event bus. Route lifecycle events, cert events, agent events, and upstream health events all publish to the bus. Connection adapters subscribe to relevant events.

```typescript
// packages/connect/event-bus.ts

type ProxyOSEvent =
  | { type: 'route.created'; route: Route }
  | { type: 'route.updated'; route: Route; prev: Route }
  | { type: 'route.deleted'; route: Route }
  | { type: 'route.enabled'; route: Route }
  | { type: 'route.disabled'; route: Route }
  | { type: 'cert.provisioned'; domain: string; cert: CertInfo }
  | { type: 'cert.expiring'; domain: string; daysRemaining: number }
  | { type: 'cert.expired'; domain: string }
  | { type: 'upstream.down'; route: Route; consecutiveFailures: number }
  | { type: 'upstream.recovered'; route: Route; downtimeSeconds: number }
  | { type: 'agent.offline'; agent: Agent }
  | { type: 'agent.online'; agent: Agent }
  | { type: 'anomaly.detected'; route: Route; metric: string; value: number; baseline: number }

class EventBus {
  publish(event: ProxyOSEvent): void
  subscribe(types: ProxyOSEvent['type'][], handler: (e: ProxyOSEvent) => void): Unsubscribe
}
```

### Credential storage

Connection credentials are encrypted at rest using AES-256-GCM. The encryption key is derived from a master secret in the environment (`PROXYOS_SECRET`). Credentials are never logged, never returned in API responses, never sent to agents. Only the Central instance holds decrypted credentials.

```typescript
interface EncryptedCredentials {
  iv: string            // base64
  ciphertext: string    // base64
  algorithm: 'aes-256-gcm'
}

// Decrypt only in-process, never serialise decrypted credentials
function decrypt(creds: EncryptedCredentials, masterKey: Buffer): Record<string, string>
```

### Connections UI location

New top-level section in sidebar: **Connections** (between Agents and Tools sections).

`/connections` — list of all configured connections, status, last sync  
`/connections/new` — connection type picker + credential form  
`/connections/[id]` — connection detail, sync log, edit credentials  

---

---

## 2. Connections: Cloudflare

The most important V3 connection. Cloudflare touches DNS, tunnels, WAF, analytics, and SSL mode — all currently managed manually.

### Credentials

- **API Token** (preferred over Global API Key) — scoped to Zone:DNS:Edit + Account:Cloudflare Tunnel:Edit
- Zone ID per domain (auto-fetched after token validated)
- Account ID (auto-fetched)

### 2.1 DNS Management

When a route is created in ProxyOS, the Cloudflare adapter automatically creates or updates the DNS record.

```typescript
// packages/connect/cloudflare/dns.ts

class CloudflareDNSAdapter {
  // Called on route.created
  async createRecord(route: Route): Promise<CloudflareDNSRecord> {
    // Determines record type:
    // - If route uses Cloudflare Tunnel: CNAME → tunnel UUID.cfargotunnel.com
    // - If route is direct: A record → ProxyOS host IP
    // - If subdomain of existing wildcard: skip (wildcard covers it)
    // Proxied: true by default (orange cloud)
  }

  async updateRecord(route: Route, prev: Route): Promise<void>
  async deleteRecord(route: Route): Promise<void>    // Prompts user first
  async listRecords(zoneId: string): Promise<CloudflareDNSRecord[]>
  async syncRecords(): Promise<SyncResult>           // Pull all CF records → local shadow table
}
```

**DNS sync** — ProxyOS maintains a local shadow table of Cloudflare DNS records. On sync, it diffs against routes:
- Routes with no DNS record → flagged (missing record)
- DNS records with no matching route → flagged (orphan record)
- DNS records pointing to wrong IP → flagged (stale record)

**DNS health in service chain view** — each route shows its DNS record status: present / missing / stale / proxied / unproxied.

**"Fix DNS" button** — appears on stale/missing records. One click creates/updates the record.

### 2.2 Tunnel Management

```typescript
// packages/connect/cloudflare/tunnel.ts

class CloudflareTunnelAdapter {
  async listTunnels(): Promise<CloudflareTunnel[]>
  async getTunnel(id: string): Promise<CloudflareTunnel>
  async createTunnel(name: string): Promise<CloudflareTunnel>
  async deleteTunnel(id: string): Promise<void>

  // Ingress rules (tunnel config)
  async getIngressRules(tunnelId: string): Promise<IngressRule[]>
  async addIngressRule(tunnelId: string, rule: IngressRule): Promise<void>
  async removeIngressRule(tunnelId: string, hostname: string): Promise<void>
  async syncIngressRules(tunnelId: string): Promise<SyncResult>
}
```

**Per-route tunnel mode** — each route can be set to "Direct" (Caddy serves publicly) or "Tunnel" (traffic via Cloudflare Tunnel). When set to Tunnel:
- ProxyOS adds an ingress rule to the selected tunnel
- ProxyOS creates a CNAME DNS record pointing to the tunnel
- `cloudflared` container is managed by ProxyOS (restart on ingress rule change)

**Tunnel health** — ProxyOS monitors `cloudflared` process health on each agent. Shows in service chain view.

### 2.3 WAF & Security

```typescript
// packages/connect/cloudflare/waf.ts

class CloudflareWAFAdapter {
  // Zone-level settings
  async getSecurityLevel(zoneId: string): Promise<SecurityLevel>
  async setBotFightMode(zoneId: string, enabled: boolean): Promise<void>

  // Per-domain firewall rules (managed as CF custom rules)
  async createGeoBlockRule(zoneId: string, countries: string[]): Promise<string>
  async createRateLimitRule(zoneId: string, config: RateLimitConfig): Promise<string>
  async deleteRule(zoneId: string, ruleId: string): Promise<void>
  async listRules(zoneId: string): Promise<CloudflareRule[]>
}
```

**UI surface:**
- Per-route "Cloudflare Security" section in route detail panel
- GeoIP block: country multi-select (shown as flags)
- Bot fight mode: toggle
- Edge rate limit: requests/minute (complements proxy-layer rate limit)
- Under attack mode: toggle (shows Cloudflare challenge page)

### 2.4 SSL/TLS Mode

```typescript
async getSSLMode(zoneId: string): Promise<'off' | 'flexible' | 'full' | 'strict'>
async setSSLMode(zoneId: string, mode: string): Promise<void>
```

ProxyOS knows your cert config (auto / internal / custom). It recommends the correct Cloudflare SSL mode automatically:
- `auto` cert → recommend `full strict`
- `internal` cert → recommend `full` (CF can't verify internal CA)
- `off` → warn strongly, recommend `flexible` at minimum

**SSL mode shown in service chain view** with mismatch warnings.

### 2.5 Analytics Overlay

```typescript
// packages/connect/cloudflare/analytics.ts

async getZoneAnalytics(zoneId: string, since: Date, until: Date): Promise<CloudflareAnalytics>
// Returns: requests, cached, uncached, bandwidth, threats, pageviews
// Resolution: 1h buckets
```

Cloudflare Analytics are merged into the ProxyOS Analytics page as a second layer:
- Total requests at edge (CF) vs requests reaching ProxyOS (origin) — shows cache hit rate
- Threats blocked at edge (CF WAF + bot management)
- Bandwidth at edge vs bandwidth at origin

Single chart with two lines: "Edge requests" (Cloudflare) + "Origin requests" (ProxyOS). The gap between them = Cloudflare cache effectiveness.

### 2.6 Cloudflare Zero Trust (Access)

```typescript
// packages/connect/cloudflare/access.ts

class CloudflareAccessAdapter {
  async listApplications(): Promise<CFAccessApp[]>
  async createApplication(config: CFAccessAppConfig): Promise<CFAccessApp>
  async deleteApplication(id: string): Promise<void>
  async listPolicies(appId: string): Promise<CFAccessPolicy[]>
  async createPolicy(appId: string, policy: CFAccessPolicy): Promise<void>
}
```

**Per-route SSO choice:**
- Authentik/Authelia (proxy layer, existing V1)
- Cloudflare Access (edge layer, new in V3)
- Both (edge + proxy, defence in depth)
- None

When "Cloudflare Access" is selected: ProxyOS creates the CF Access application + policy automatically. No Cloudflare dashboard visit needed.

---

---

## 3. Connections: Identity Providers

### 3.1 Authentik (upgraded from V1)

V1 only generated the `forward_auth` Caddy config. V3 closes the loop by managing Authentik directly.

```typescript
// packages/connect/authentik/index.ts

class AuthentikAdapter implements ConnectionAdapter {
  // Outpost management
  async listOutposts(): Promise<AuthentikOutpost[]>
  async getOutpost(id: string): Promise<AuthentikOutpost>
  async createOutpost(config: OutpostConfig): Promise<AuthentikOutpost>

  // Application management
  async listApplications(): Promise<AuthentikApplication[]>
  async createApplication(slug: string, name: string, provider: string): Promise<AuthentikApplication>
  async deleteApplication(slug: string): Promise<void>

  // Provider management (proxy providers)
  async createProxyProvider(config: ProxyProviderConfig): Promise<AuthentikProvider>
  async deleteProvider(id: number): Promise<void>

  // Route hooks
  async onRouteCreated(route: Route): Promise<void> {
    // If SSO provider = authentik:
    // 1. Create proxy provider for the domain
    // 2. Create application linked to provider
    // 3. Add application to outpost
    // 4. No Authentik UI visit required
  }

  async onRouteDeleted(route: Route): Promise<void> {
    // Remove application + provider from Authentik
  }
}
```

**What this means in practice:**

Before V3: user enables SSO toggle → ProxyOS generates forward_auth config → user manually opens Authentik, creates provider, creates application, adds to outpost, copies forward auth URL back.

After V3: user enables SSO toggle → ProxyOS does all of the above automatically. Authentik is fully configured before the route is live.

### 3.2 Authelia (upgraded from V1)

Same pattern — V3 can write Authelia access control rules automatically when SSO is enabled for a route.

```typescript
// packages/connect/authelia/index.ts

class AutheliaAdapter implements ConnectionAdapter {
  // Authelia config is file-based (access_control.rules in YAML)
  // Adapter reads config file, adds/removes rules, writes back, signals reload

  async onRouteCreated(route: Route): Promise<void> {
    // Append access_control rule for domain
    // policy: one_factor or two_factor based on route config
    // Signal Authelia reload (docker exec or API)
  }

  async onRouteDeleted(route: Route): Promise<void> {
    // Remove access_control rule for domain
  }
}
```

### 3.3 Keycloak (new in V3)

```typescript
class KeycloakAdapter implements ConnectionAdapter {
  // Manages Keycloak clients (one per SSO-protected route)
  async createClient(route: Route): Promise<KeycloakClient>
  async deleteClient(clientId: string): Promise<void>
  async getClient(clientId: string): Promise<KeycloakClient>
}
```

Credentials: Realm + Admin username + password (or service account client credentials).

### 3.4 Zitadel (new in V3)

```typescript
class ZitadelAdapter implements ConnectionAdapter {
  async createProject(name: string): Promise<ZitadelProject>
  async createApplication(projectId: string, name: string): Promise<ZitadelApp>
  async deleteApplication(projectId: string, appId: string): Promise<void>
}
```

---

---

## 4. Connections: DNS Providers

All DNS adapters implement the same interface:

```typescript
interface DNSAdapter {
  createRecord(domain: string, type: 'A' | 'CNAME' | 'TXT', value: string): Promise<string>
  updateRecord(id: string, value: string): Promise<void>
  deleteRecord(id: string): Promise<void>
  listRecords(domain: string): Promise<DNSRecord[]>
  getRecord(id: string): Promise<DNSRecord>
}
```

### 4.1 Cloudflare DNS
Covered in section 2.1.

### 4.2 Hetzner DNS (new in V3)

```typescript
class HetznerDNSAdapter implements DNSAdapter {
  // API: https://dns.hetzner.com/api/v1
  // Credentials: API token
  // Also handles DNS-01 challenges for TLS cert provisioning
}
```

### 4.3 Route53 (new in V3)

```typescript
class Route53Adapter implements DNSAdapter {
  // Credentials: AWS Access Key ID + Secret
  // Hosted Zone ID per domain (auto-fetched)
}
```

### 4.4 Namecheap (new in V3)

```typescript
class NamecheapAdapter implements DNSAdapter {
  // Credentials: API username + API key + whitelisted IP
  // Uses Namecheap XML API
}
```

---

---

## 5. Connections: Tunnel Providers

### 5.1 Cloudflare Tunnel
Covered in section 2.2.

### 5.2 Tailscale Funnel (new in V3)

Tailscale Funnel exposes a Tailscale node to the public internet. ProxyOS can manage Funnel rules via the Tailscale API.

```typescript
// packages/connect/tailscale/funnel.ts

class TailscaleFunnelAdapter implements ConnectionAdapter {
  // Credentials: OAuth client credentials (tailnet-level)

  async listFunnelRules(): Promise<TailscaleFunnelRule[]>
  async createFunnelRule(nodeId: string, port: number): Promise<void>
  async deleteFunnelRule(nodeId: string, port: number): Promise<void>

  // Route hook: when a route is assigned to an agent on a Tailscale node,
  // and tunnel mode = tailscale_funnel, creates the funnel rule automatically
  async onRouteCreated(route: Route): Promise<void>
}
```

### 5.3 WireGuard (existing, formalised)

The existing WireGuard tunnel to RackNerd VPS is formalised as a Connection. ProxyOS doesn't manage WireGuard config (too low-level) but monitors the tunnel health and shows it in the service chain view.

```typescript
class WireGuardMonitorAdapter implements ConnectionAdapter {
  // Reads `wg show` output via SSH or agent-side command
  // Reports: peer status, last handshake, bytes transferred, latency
  // Does not write WireGuard config
}
```

---

---

## 6. Connections: Monitoring

### 6.1 Uptime Kuma (new in V3)

The highest-ROI monitoring connection for your stack.

```typescript
// packages/connect/uptime-kuma/index.ts

class UptimeKumaAdapter implements ConnectionAdapter {
  // Credentials: Uptime Kuma URL + username + password (or API key)
  // Uses Uptime Kuma's unofficial API (Socket.IO)

  async listMonitors(): Promise<UptimeKumaMonitor[]>
  async createMonitor(config: MonitorConfig): Promise<UptimeKumaMonitor>
  async pauseMonitor(id: number): Promise<void>
  async resumeMonitor(id: number): Promise<void>
  async deleteMonitor(id: number): Promise<void>
  async getMonitorStatus(id: number): Promise<MonitorStatus>

  // Route hooks
  async onRouteCreated(route: Route): Promise<void> {
    // Creates HTTP monitor: domain, check every 60s, HTTP keyword check
    // Names monitor: "ProxyOS: {domain}"
    // Links monitor ID back to route in ProxyOS DB
  }

  async onRouteDeleted(route: Route): Promise<void> {
    // Pauses monitor (doesn't delete — preserves history)
  }

  async onRouteDisabled(route: Route): Promise<void> {
    // Pauses monitor
  }
}
```

**Deduplication:** If Uptime Kuma fires "down" AND ProxyOS upstream health check also detects down — ProxyOS suppresses the second alert. One incident, one notification.

**Status page embed:** Uptime Kuma status page URL surfaced in ProxyOS route detail. Option to add route to a specific status page group.

**Monitor sync:** On first connect, ProxyOS scans existing Uptime Kuma monitors and tries to match them to existing routes by URL. Shows matches for user confirmation before linking.

### 6.2 Betterstack (new in V3)

```typescript
class BetterstackAdapter implements ConnectionAdapter {
  // Credentials: API token
  // Creates Betterstack Uptime monitors + incidents

  async createMonitor(config: MonitorConfig): Promise<BetterstackMonitor>
  async pauseMonitor(id: string): Promise<void>
  async deleteMonitor(id: string): Promise<void>
  async getIncidents(monitorId: string): Promise<BetterstackIncident[]>
}
```

### 6.3 Freshping (new in V3)

```typescript
class FreshpingAdapter implements ConnectionAdapter {
  // Credentials: API key
  async createCheck(config: CheckConfig): Promise<FreshpingCheck>
  async pauseCheck(id: number): Promise<void>
  async deleteCheck(id: number): Promise<void>
}
```

---

---

## 7. Connections: Notification Channels

### 7.1 Zulip (new in V3 — your stack)

```typescript
// packages/connect/zulip/index.ts

class ZulipAdapter implements ConnectionAdapter {
  // Credentials: Zulip server URL + bot email + bot API key
  // Configured stream + topic per alert type

  async sendMessage(stream: string, topic: string, content: string): Promise<void>

  // Subscribes to ProxyOS event bus:
  // upstream.down → sends to #infrastructure stream, "ProxyOS Alerts" topic
  // cert.expiring → sends to #infrastructure stream, "Cert Expiry" topic
  // agent.offline → sends to #infrastructure stream, "Agent Alerts" topic
  // anomaly.detected → sends to #infrastructure stream, "Traffic Anomalies" topic
}
```

Message format uses Zulip markdown with structured blocks:

```
**ProxyOS Alert** — upstream down
Route: `gitbay.homelabza.com`
Upstream: `192.168.69.10:3000`
Agent: `homelab-primary`
Down for: 3 minutes
[View route](https://proxy.homelabza.com/routes/rt_xxx)
```

### 7.2 Slack (new in V3)

```typescript
class SlackAdapter implements ConnectionAdapter {
  // Credentials: Webhook URL or Bot Token + channel
  async sendMessage(channel: string, blocks: SlackBlock[]): Promise<void>
}
```

### 7.3 Webhook / n8n (upgraded from V1)

V1 had basic webhook support. V3 upgrades to a full event subscription model:

```typescript
interface WebhookConfig {
  id: string
  url: string
  events: ProxyOSEvent['type'][]    // subscribe to specific event types
  secret: string                     // HMAC-SHA256 signing secret
  retries: number                    // retry on failure (default 3)
  timeout: number                    // ms (default 5000)
}
```

Webhook payload includes event type, timestamp, full event data, and an HMAC-SHA256 signature header (`X-ProxyOS-Signature`). n8n can verify the signature with the shared secret.

**Webhook log** — every webhook delivery logged: URL, event type, HTTP status, response time, payload preview. Retry button for failed deliveries.

### 7.4 Email/SMTP (upgraded from V1)

V3 adds per-event email templates with HTML formatting. Alert emails include the service chain status at time of alert.

---

---

## 8. Service Chain View

The centrepiece of V3. Every route has a **chain view** — a live visualisation of every component between the user and the upstream service.

### Chain node types

```typescript
interface ChainNode {
  id: string
  type: 'dns' | 'tunnel' | 'edge_waf' | 'proxy' | 'tls' | 'sso' | 'rate_limit' | 'upstream'
  label: string               // e.g. "Cloudflare DNS", "Authentik", "Caddy"
  status: 'healthy' | 'degraded' | 'down' | 'unknown' | 'unconfigured'
  detail: string              // e.g. "A → 23.95.170.217", "p95: 12ms", "82 days remaining"
  warningMessage?: string
  link?: string               // deep link to manage this node
  provider?: string           // cloudflare / authentik / internal / etc.
}
```

### Chain for a typical public route (gitbay.homelabza.com)

```
┌──────────────────────────────────────────────────────────────┐
│  gitbay.homelabza.com  ●  online                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [CF DNS] ──→ [CF Tunnel] ──→ [CF WAF] ──→                  │
│                                                              │
│  [ProxyOS] ──→ [TLS :443] ──→ [Authentik] ──→               │
│                                                              │
│  [Upstream 192.168.69.10:3000]                               │
│                                                              │
│  Each node: coloured dot + label + detail line + fix button  │
└──────────────────────────────────────────────────────────────┘
```

### Chain for an internal LAN route (sonar.homelabza.com)

```
[Internal DNS] ──→ [ProxyOS] ──→ [Internal CA TLS] ──→ [Upstream :9000]
```

(No Cloudflare nodes — ProxyOS knows this route is internal-only)

### Chain status rollup

The chain has an overall status: the worst status of any node. If DNS is healthy but SSO is degraded, the chain shows "degraded."

### Where chain view appears

1. **Route detail side panel** — compact horizontal chain at the top, full detail expandable
2. **Route list table** — tiny chain health indicator (coloured dots) in status column
3. **Dashboard** — routes with chain degradation surfaced in alert banner
4. **Agents page** — chains per agent, grouped

### Chain debug mode

Click "Debug chain" on any route → ProxyOS runs a live end-to-end check:
1. DNS lookup for the domain (using system resolver + Cloudflare 1.1.1.1 + Google 8.8.8.8)
2. HTTP GET to domain (checks response, TLS, redirects)
3. Caddy route lookup (internal API)
4. Upstream health check (direct probe)
5. SSO provider reachability (GET to forward_auth URL)

Results shown step by step with pass/fail and latency. Identifies exactly where the chain breaks.

---

---

## 9. V3 Expose Wizard — Full Chain

The expose wizard is completely rethought in V3. Instead of 5 steps configuring only Caddy, it now configures the entire chain in a single flow. Steps expand or contract based on which Connections are active.

### Step 1 — Source (unchanged from V2)

Manual IP:port or pick from InfraOS topology or scanner suggestions.

### Step 2 — Domain + DNS

- Domain input (unchanged)
- TLS mode selector (unchanged)
- **NEW:** DNS configuration section (only shown if DNS Connection active):
  - "Auto-create DNS record" toggle (default ON)
  - DNS provider shown (e.g. "Cloudflare — homelabza.com")
  - Record type auto-selected: CNAME for tunnel routes, A for direct routes
  - Preview: `n8n.homelabza.com → CNAME → abc123.cfargotunnel.com`

### Step 3 — Routing path

**NEW step in V3** — only shown if tunnel connections are active:
- Route via: **Direct** (Caddy serves publicly) / **Cloudflare Tunnel** / **Tailscale Funnel** / **WireGuard** (informational only)
- If Cloudflare Tunnel selected: show list of available tunnels, user picks one
- If Tailscale Funnel: show which Tailscale node will serve this route

For internal-only routes: this step shows "Internal (LAN only)" and no tunnel options.

### Step 4 — Access (upgraded)

- **SSO** toggle (unchanged)
  - Provider picker: Authentik / Authelia / Keycloak / Zitadel / Cloudflare Access / None
  - **NEW:** Shows "Auto-configure provider" notice — ProxyOS will create the application in the chosen provider automatically
- **IP allowlist** (unchanged)
- **NEW:** Cloudflare security (only shown if CF connection active):
  - Bot fight mode toggle
  - GeoIP block: country picker
  - Edge rate limit: rpm input
- **NEW:** Proxy-layer security:
  - GeoIP block toggle (MaxMind, local)
  - JWT validation toggle + JWKS URL
  - Secret header injection toggle

### Step 5 — Options (unchanged from V2)

Rate limiting, compression, WebSocket, HTTP/3, health check, custom headers.

### Step 6 — Monitoring (NEW)

Only shown if monitoring Connections active:
- **Auto-create monitor** toggle (default ON per active monitoring connection)
- Shows which monitoring services will create monitors: "Uptime Kuma ✓" / "Betterstack ✓"
- Monitor interval: dropdown (30s / 60s / 5m)
- Alert channels: checkboxes (Email / Zulip / Slack / Webhook)

### Step 7 — Review (upgraded)

Full chain preview — shows every action that will be taken across all systems:

```
ProxyOS will:

  Caddy          Create route for n8n.homelabza.com → 192.168.69.25:5678
  TLS            Provision Let's Encrypt cert (DNS-01, Cloudflare)
  Cloudflare DNS Create CNAME n8n.homelabza.com → abc123.cfargotunnel.com
  CF Tunnel      Add ingress rule for n8n.homelabza.com to tunnel "homelab"
  Authentik      Create proxy provider + application "n8n"
  Uptime Kuma    Create HTTP monitor for https://n8n.homelabza.com
```

User can expand each line to see the exact API call that will be made.

**"Expose" button** — fires all actions simultaneously (parallel where possible, sequential where ordering matters: DNS before tunnel, proxy before SSO).

### Post-expose — chain status

After expose, shows the chain forming in real time:

```
Caddy route     ✓  active in 47ms
DNS record      ✓  created (may take 1-5min to propagate)
CF Tunnel       ✓  ingress rule added
TLS cert        ⏳  provisioning (DNS-01 challenge in progress)
Authentik       ✓  application created
Uptime Kuma     ✓  monitor created (ID: 42)
```

---

---

## 10. Traffic Intelligence

### 10.1 Smart routing rules

Path-based, header-based, and query-parameter routing. ProxyOS exposes Caddy's matcher system through a UI.

```typescript
interface RouteMatcher {
  type: 'host' | 'path' | 'header' | 'query' | 'method' | 'remote_ip'
  // host: domain (existing)
  // path: /api/*, /app/*, exact match, regex
  // header: key + value match
  // query: key + value match
  // method: GET, POST, etc.
  // remote_ip: CIDR ranges
}

interface RouteRule {
  matchers: RouteMatcher[]    // AND logic between matchers
  upstream: string            // IP:port
  priority: number            // lower = higher priority
}

// A single "route" in V3 can have multiple rules
// e.g. /api/* → service-a:3001, /app/* → service-b:3000, /* → service-c:8080
```

**UI:** Route rule builder. Add rule button. Drag to reorder priority. Test rule button (shows which rule matches a given request URL).

### 10.2 A/B traffic splitting

```typescript
interface TrafficSplit {
  upstreams: {
    target: string      // IP:port
    weight: number      // 0-100, must sum to 100
    label: string       // "stable", "canary", "v2"
  }[]
  stickySession: boolean
  cookieName?: string   // if sticky
}
```

**UI:** Slider per upstream. "Stable 90% / Canary 10%" default. Live traffic counter showing actual split percentages from access logs.

Caddy implements this via `lb_policy: random` with `lb_try_duration` or `first` policy with request weights.

### 10.3 Request/response transformations

ProxyOS exposes Caddy's `rewrite`, `header`, and `respond` handlers through a form:

**Request transformations:**
- Path rewrite: strip prefix, add prefix, regex replace
- Add/remove/set request headers
- Rewrite Host header
- Force HTTPS redirect

**Response transformations:**
- Add/remove/set response headers
- CORS headers (preset: permissive / restrictive / custom)
- HSTS header (preset with configurable max-age)
- X-Frame-Options, X-Content-Type-Options toggles

### 10.4 Mirror traffic

```typescript
interface TrafficMirror {
  mirrorUpstream: string    // shadow upstream IP:port
  percentage: number        // 1-100, how much traffic to mirror
  async: boolean            // fire-and-forget (don't wait for mirror response)
}
```

Caddy's `copy_response` handler with a secondary handler. Mirror responses are logged separately but don't affect the real response. Use case: testing a new version of an upstream with live traffic.

### 10.5 Upstream latency SLO

```typescript
interface UpstreamSLO {
  routeId: string
  p95TargetMs: number       // e.g. 200
  p99TargetMs: number       // e.g. 500
  windowDays: number        // rolling window for compliance (default 30)
  alertOnBreach: boolean
}
```

**UI:** Per-route SLO config in route detail. Compliance percentage shown (e.g. "p95 SLO: 97.3% compliant over 30d"). Trend chart showing SLO compliance over time. Breach alerts via event bus → all notification channels.

---

---

## 11. Security Layer

### 11.1 GeoIP blocking (proxy layer)

Uses MaxMind GeoLite2 database, bundled with ProxyOS Docker image, updated weekly via cron.

```typescript
interface GeoIPConfig {
  mode: 'allowlist' | 'blocklist'
  countries: string[]     // ISO 3166-1 alpha-2 codes e.g. ['CN', 'RU', 'KP']
  action: 'block' | 'challenge'   // challenge = redirect to captcha
}
```

Caddy's `remote_ip` matcher used to block IPs matching the GeoLite2 database for the configured countries. Blocked requests return 403 with a configurable error page.

**UI:** Country picker with flags, search, "Block high-risk countries" preset button (pre-selects known high-abuse country list).

### 11.2 Bot challenge

Cloudflare Turnstile integration. When enabled on a route, ProxyOS serves an intermediate challenge page before forwarding to the upstream.

```typescript
interface BotChallengeConfig {
  provider: 'turnstile' | 'hcaptcha'
  siteKey: string
  secretKey: string
  challengeOnce: boolean    // cookie-based: challenge once per session
  excludePaths: string[]    // paths to skip challenge e.g. ['/api/*', '/health']
}
```

Implementation: Caddy serves a static challenge page (ProxyOS-hosted) for unchallenged requests. On successful challenge, sets a signed cookie. Subsequent requests with valid cookie bypass challenge.

### 11.3 Fail2ban integration

ProxyOS watches its own access logs and auto-bans IPs based on configurable rules.

```typescript
interface Fail2banRule {
  name: string
  filter: {
    statusCode?: number[]       // e.g. [401, 403] — too many auth failures
    pathPattern?: string        // regex e.g. "^/wp-login" — scanner patterns
    userAgentPattern?: string   // regex
  }
  threshold: number             // hits within window
  windowSeconds: number         // e.g. 300 (5 minutes)
  banDurationSeconds: number    // e.g. 3600 (1 hour)
  routes: string[] | 'all'      // which routes this rule applies to
}
```

Bans are applied as Caddy IP matcher entries — no external fail2ban process needed. Ban list stored in SQLite, cleaned up on expiry. **Ban log** — table showing active bans + history with unban button.

**Presets:** "WordPress scanner" (bans IPs hitting /wp-login, /xmlrpc.php), "Auth bruteforce" (bans IPs with 5+ 401s in 60s), "Generic scanner" (bans IPs hitting known vulnerability paths).

### 11.4 Mutual TLS (mTLS)

```typescript
interface MTLSConfig {
  enabled: boolean
  requireClientCert: boolean
  trustedCAs: string[]          // PEM-encoded CA certs (ProxyOS internal CA or custom)
  allowedCommonNames?: string[] // restrict to specific client cert CNs
}
```

ProxyOS generates client certificates via its internal CA for each authorised client. Certificate management UI: issue cert, download as PEM/P12, revoke cert. Revoked certs added to CRL (Certificate Revocation List) served by ProxyOS.

### 11.5 JWT validation at proxy

```typescript
interface JWTConfig {
  jwksUrl: string               // e.g. https://auth.homelabza.com/application/o/gitbay/jwks/
  issuer?: string               // validate iss claim
  audience?: string             // validate aud claim
  algorithms: string[]          // e.g. ['RS256']
  extractClaims: string[]       // claims to forward as headers e.g. ['sub', 'email']
  skipPaths: string[]           // paths that don't require JWT
}
```

Caddy `jwtauth` plugin handles validation. If JWT is invalid: 401 response with `WWW-Authenticate: Bearer` header. If valid: claims forwarded as `X-JWT-{Claim}` headers to upstream.

### 11.6 Secret header injection

```typescript
interface SecretHeaderConfig {
  headerName: string            // e.g. 'X-ProxyOS-Secret'
  secret: string                // stored encrypted, injected at forward time
  removeOnResponse: boolean     // strip the header from responses
}
```

Caddy `header` handler adds the header before forwarding. Upstream checks for the header and returns 403 if missing — proves traffic came through ProxyOS, blocks direct access.

### 11.7 Tor/VPN exit node blocking

Uses regularly-updated blocklists (Dan.me.uk Tor exit list, ipinfo.io VPN/proxy list). ProxyOS fetches and caches the lists (update interval: configurable, default 24h). Applied as Caddy IP matcher entries.

```typescript
interface ExitNodeBlockConfig {
  blockTor: boolean
  blockVPN: boolean
  blockDatacenter: boolean    // blocks known datacenter IP ranges (AWS, GCP, Azure)
  updateIntervalHours: number
}
```

---

---

## 12. Observability Upgrades

### 12.1 Real-time traffic heatmap

New page: `/analytics/live`

WebSocket-fed live view. Every second, shows a grid of all routes with colour intensity based on request rate. Colour by: status code mix (green=2xx, amber=3xx/4xx, red=5xx).

Click a route cell → expanded live metrics panel slides in.

### 12.2 Anomaly detection

```typescript
interface AnomalyDetector {
  routeId: string
  metric: 'req_per_min' | 'error_rate' | 'p95_latency'
  // Rolling 7-day baseline: mean + std deviation per hour-of-week slot
  // Alert when current value > baseline + (sensitivity * stddev)
  sensitivity: number    // 1.0 = 1 stddev, 2.0 = 2 stddev (default 2.0)
  minBaselineDays: number  // wait until N days of data before alerting (default 3)
}
```

No ML dependency — pure statistics. Rolling hourly buckets per route. Fires `anomaly.detected` event to event bus when threshold breached. Suppression: won't re-alert the same metric for the same route within 1 hour.

### 12.3 Upstream response time trending

Each route's analytics page gains a **"Upstream health trend"** section:
- 30-day p95 latency chart (daily granularity)
- Trend line + trend direction indicator (improving / stable / degrading)
- "Getting slower" alert: if 7-day average p95 > 1.5× 30-day average, fires amber alert
- Correlation with deployment events (if InfraOS connected, overlays container restart times)

### 12.4 Request tracing

```typescript
interface TraceConfig {
  enabled: boolean
  headerName: string      // default 'X-Request-ID'
  generateIfMissing: boolean   // generate UUID if request doesn't have one
  logFormat: 'json' | 'text'
}
```

Each access log entry gets the request ID. ProxyOS log viewer can filter by request ID — shows all access log entries with that ID across all routes (useful for cross-service tracing).

### 12.5 Slow request log

Dedicated table per route showing requests that exceeded a configurable latency threshold.

```typescript
interface SlowRequestConfig {
  thresholdMs: number         // default 1000ms
  retainDays: number          // default 7
  logRequestBody: boolean     // false by default (privacy)
}
```

Table: timestamp, path, method, status, total time, upstream time, client IP. Export as CSV.

### 12.6 Bandwidth billing view

New section in Analytics: **Bandwidth**

Per-route bandwidth over configurable billing period (e.g. 1st–last of month):
- Inbound bytes
- Outbound bytes
- Total
- Projected end-of-month (based on current rate)

Alert: configurable threshold (e.g. "Alert when route exceeds 50GB/month"). Useful for RackNerd VPS bandwidth limits.

### 12.7 Prometheus exporter (promoted from V2 "not in V1")

```
GET /metrics

# Per-route metrics
proxyos_route_requests_total{route="gitbay.homelabza.com", status="200"} 15234
proxyos_route_request_duration_seconds{route="...", quantile="0.95"} 0.042
proxyos_route_upstream_health{route="...", upstream="192.168.69.10:3000"} 1

# Agent metrics
proxyos_agent_status{agent="homelab-primary"} 1
proxyos_agent_routes_total{agent="homelab-primary"} 12

# Certificate metrics
proxyos_cert_expiry_days{domain="gitbay.homelabza.com"} 82

# Connection metrics
proxyos_connection_status{connection="cloudflare", type="cloudflare"} 1
```

Grafana dashboard JSON shipped with ProxyOS (pre-built, importable).

---

---

## 13. Certificate Intelligence

### 13.1 Certificate transparency monitoring

ProxyOS polls crt.sh for each configured domain. Any certificate issued that wasn't provisioned by ProxyOS triggers an alert.

```typescript
interface CTMonitorConfig {
  domains: string[]           // auto-populated from routes
  checkIntervalHours: number  // default 6
  alertOnNewIssuer: boolean   // alert if new CA issues cert for domain
  knownIssuers: string[]      // auto-populated from ProxyOS-managed certs
}
```

Alert: "New certificate issued for gitbay.homelabza.com by Unknown CA (Let's Encrypt Authority X3) — not issued by ProxyOS. Possible domain compromise."

### 13.2 Certificate health score

Per-domain score (0-100) based on:
- HSTS present and max-age ≥ 1 year (+20)
- OCSP stapling working (+15)
- Certificate Transparency log inclusion (+15)
- Full certificate chain served (+15)
- Strong cipher suite (TLS 1.3 preferred) (+20)
- CAA DNS record present (+15)

Score shown in certificates table and route detail. Drill down shows which checks passed/failed with fix instructions.

### 13.3 Multi-domain cert management

```typescript
interface MultiDomainCert {
  id: string
  domains: string[]           // SAN list
  mode: 'auto' | 'dns'
  routes: string[]            // route IDs sharing this cert
  issuer: string
  expiry: Date
}
```

ProxyOS can provision one cert for multiple subdomains (e.g. `*.homelabza.com`) and share it across routes. Reduces Let's Encrypt rate limit consumption. DNS-01 required for wildcard.

### 13.4 ACME account management

```typescript
interface ACMEAccount {
  id: string
  email: string
  provider: 'letsencrypt' | 'zerossl' | 'custom'
  acmeUrl: string
  certsCount: number
  rateLimit: {
    domain: number        // certs per domain per week (LE: 50)
    used: number
    resetAt: Date
  }
}
```

Multiple ACME accounts configurable. ProxyOS distributes cert provisioning across accounts to avoid rate limits. Alert when approaching rate limit threshold.

---

---

## 14. Developer & Automation

### 14.1 ProxyOS REST API

Full REST API alongside tRPC. Scoped API keys.

```
Base URL: https://proxy.homelabza.com/api/v1

Authentication: Authorization: Bearer pak_xxxxxxxxxxxx

Scopes:
  read         GET endpoints only
  routes       Route CRUD
  agents       Agent management
  connections  Connection management (read credentials never returned)
  admin        All operations + settings

Endpoints:
  GET    /routes
  POST   /routes
  GET    /routes/{id}
  PUT    /routes/{id}
  DELETE /routes/{id}
  POST   /routes/{id}/expose
  POST   /routes/{id}/disable

  GET    /agents
  GET    /agents/{id}
  GET    /agents/{id}/metrics

  GET    /certificates
  POST   /certificates/{id}/renew

  GET    /connections
  POST   /connections/{id}/sync
  GET    /connections/{id}/status

  GET    /analytics/summary
  GET    /analytics/routes/{id}

  POST   /scanner/scan
  GET    /scanner/results
```

API key management UI: `/settings/api-keys` — create, name, scope, revoke. Last used timestamp shown.

### 14.2 Route templates

```typescript
interface RouteTemplate {
  id: string
  name: string              // e.g. "Homelab internal service"
  description: string
  defaults: Partial<RouteConfig>
  // Captures: TLS mode, SSO provider, rate limit, compression,
  //           GeoIP config, custom headers, monitoring config
}
```

**Built-in templates:**
- "Public SaaS endpoint" — auto TLS, Authentik SSO, 100rpm rate limit, GeoIP block high-risk, Uptime Kuma monitor
- "Internal homelab service" — internal CA, Authentik SSO, no rate limit, no monitoring
- "Public API endpoint" — auto TLS, JWT validation, 1000rpm rate limit, no SSO, Uptime Kuma monitor
- "Static/simple service" — auto TLS, no SSO, compression on

User can save any existing route config as a template. Templates applied in expose wizard Step 1 before other config.

### 14.3 Terraform provider

```hcl
# ProxyOS Terraform provider

terraform {
  required_providers {
    proxyos = {
      source  = "proxyos/proxyos"
      version = "~> 3.0"
    }
  }
}

provider "proxyos" {
  url     = "https://proxy.homelabza.com"
  api_key = var.proxyos_api_key
}

resource "proxyos_route" "gitbay" {
  domain   = "gitbay.homelabza.com"
  upstream = "192.168.69.10:3000"
  tls_mode = "auto"

  sso {
    enabled  = true
    provider = "authentik"
  }

  rate_limit {
    enabled = true
    rpm     = 200
  }

  agent_id = proxyos_agent.homelab_primary.id
}

resource "proxyos_agent" "homelab_primary" {
  name     = "homelab-primary"
  site_tag = "homelab"
}
```

Provider implements: routes (CRUD), agents (CRUD), connections (read-only, credentials managed separately).

### 14.4 CLI

`proxyos` binary (Node.js / distributed as single binary via pkg).

```bash
# Authentication
proxyos auth login https://proxy.homelabza.com

# Route management
proxyos expose 192.168.69.25:5678 \
  --domain n8n.homelabza.com \
  --tls auto \
  --sso authentik \
  --template "homelab-internal"

proxyos routes list
proxyos routes disable gitbay.homelabza.com
proxyos routes delete gitbay.homelabza.com

# Chain view in terminal
proxyos chain gitbay.homelabza.com

# Agent management
proxyos agents list
proxyos agents register --name homelab-secondary --site homelab

# Scanner
proxyos scan --agent homelab-primary
proxyos scan expose n8n_container

# Connections
proxyos connections list
proxyos connections sync cloudflare
```

### 14.5 Compose label watcher

Monitors a Docker Compose project directory for changes using `inotify`. When `docker-compose.yml` is modified:
1. Re-parse all `proxyos.*` labels
2. Diff against current routes
3. Apply additions/changes/removals to ProxyOS
4. No manual rescan needed

```typescript
interface ComposeWatcher {
  projectPath: string       // e.g. /opt/gitbay
  agentId: string
  autoApply: boolean        // if false, shows diff and waits for approval
  watchInterval: number     // fallback poll interval if inotify unavailable
}
```

---

---

## 15. Teams & Multi-tenancy

These features are **ProxyOS Cloud Teams ($29/mo)** and **self-hosted Teams add-on** only.

### 15.1 User accounts & roles

```typescript
type UserRole = 'admin' | 'operator' | 'viewer'

interface User {
  id: string
  email: string
  role: UserRole
  ssoProvider?: string    // login via Authentik/Google/GitHub
  apiKeys: APIKey[]
  createdAt: Date
  lastLogin: Date
}
```

Permissions:
- admin: full access, settings, user management, delete operations
- operator: manage routes, agents, connections — no settings, no user management
- viewer: read-only, no credentials visible, no chain view (hides IPs)

### 15.2 Route ownership

```typescript
interface RouteOwnership {
  routeId: string
  ownerId: string           // user who created/claimed the route
  notifyOnAlerts: boolean   // send alerts to owner's notification prefs
}
```

Route detail shows owner. Owner receives cert expiry, upstream down, anomaly alerts for their routes. Useful in team environments where different people own different services.

### 15.3 Change approvals

```typescript
interface ApprovalConfig {
  enabled: boolean
  requiredApprovers: number   // default 1
  exemptRoles: UserRole[]     // default: ['admin']
  exemptActions: string[]     // e.g. ['route.disable'] — break-glass exemptions
  timeout: number             // minutes before request expires (default 60)
}
```

When enabled: route changes by operators create a **pending change** rather than applying immediately. Admin or other operator approves/rejects. Audit log shows approver.

### 15.4 SSO for ProxyOS dashboard

```typescript
interface DashboardSSO {
  provider: 'authentik' | 'google' | 'github' | 'microsoft'
  clientId: string
  clientSecret: string        // encrypted at rest
  allowedDomains?: string[]   // e.g. ['homelabza.com']
  autoProvisionUsers: boolean // create user on first login
  defaultRole: UserRole       // for auto-provisioned users
}
```

ProxyOS login page shows configured SSO providers. Local username/password remains as fallback for admin.

### 15.5 Org → site → agent hierarchy (Cloud)

```
Organisation (ProxyOS Cloud account)
├── Site: homelab
│   ├── Agent: homelab-primary
│   └── Agent: homelab-secondary
├── Site: production
│   └── Agent: hetzner-prod
└── Site: relay
    └── Agent: vps-racknerd
```

Billing at org level. Usage shown per site. Admin can restrict operators to specific sites.

---

---

## 16. Homelab OS Family Integrations

### 16.1 InfraOS (upgraded)

V1 adapter was read-only (ProxyOS → InfraOS topology sync). V3 becomes bidirectional:

**InfraOS → ProxyOS:**
- `ios expose` command creates a ProxyOS route (not raw Caddy config)
- InfraOS topology view can trigger expose wizard for any service
- InfraOS drift detection covers ProxyOS config (if a route was manually edited in Caddy)

**ProxyOS → InfraOS:**
- Route chain view nodes link to InfraOS for upstream containers/VMs
- Service latency trends from ProxyOS shown in InfraOS topology

### 16.2 BackupOS (upgraded)

ProxyOS registers itself as a BackupOS target automatically:
- SQLite DB (`proxyos.db`) — backed up on schedule, before/after schema migrations
- Caddy config state — exported as JSON, backed up
- Connection credentials — encrypted export (requires master secret to restore)
- Restore: one-click restore rebuilds full Caddy state from backup

BackupOS pre-patch snapshot triggered before ProxyOS version updates.

### 16.3 LockBoxOS (new V3)

Connection credentials (Cloudflare API token, Authentik client secret, etc.) optionally stored in LockBoxOS vault instead of ProxyOS's own encrypted SQLite field.

```typescript
interface LockBoxOSCredentialRef {
  vaultId: string
  secretPath: string    // e.g. proxyos/cloudflare/api-token
}
```

ProxyOS fetches credentials from LockBoxOS at use time, never caches them beyond the request. Credential rotation in LockBoxOS automatically propagates to ProxyOS connections.

mTLS client certs generated by ProxyOS stored in LockBoxOS for inventory and rotation management.

### 16.4 MxWatch (new V3)

ProxyOS detects routes serving mail-related domains or ports:
- Domains matching `mail.*`, `smtp.*`, `imap.*`, `webmail.*`, `mta.*`
- Upstreams on ports 25, 587, 993, 995, 4190

Flags these routes to MxWatch: "This route serves mail infrastructure. Enable MxWatch monitoring?" One-click creates MxWatch domain entry.

MxWatch status (DMARC pass rate, blacklist status, deliverability score) surfaced in ProxyOS route detail chain view as a node: "MxWatch — deliverability: 9.8/10".

### 16.5 PatchOS (new V3)

ProxyOS agent version tracked by PatchOS across fleet. PatchOS manages the update lifecycle:
1. PatchOS detects new ProxyOS agent version available
2. PatchOS takes BackupOS snapshot of ProxyOS DB
3. PatchOS pushes update to agents one by one (canary first)
4. ProxyOS reports health after update
5. If health check fails: PatchOS triggers auto-rollback to previous version

ProxyOS exposes a `/health` endpoint that PatchOS polls post-update.

---

---

## 17. Database Schema Additions

```sql
-- Connections
CREATE TABLE connections (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  name          TEXT NOT NULL,
  credentials   TEXT NOT NULL,       -- AES-256-GCM encrypted JSON
  status        TEXT DEFAULT 'disconnected',
  last_sync     INTEGER,
  last_error    TEXT,
  config        TEXT,                -- non-secret config as JSON
  created_at    INTEGER NOT NULL
);

-- Connection sync log
CREATE TABLE connection_sync_log (
  id            TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id),
  timestamp     INTEGER NOT NULL,
  result        TEXT,                -- success | error
  message       TEXT,
  duration_ms   INTEGER
);

-- DNS shadow records (local copy of DNS state)
CREATE TABLE dns_records_shadow (
  id            TEXT PRIMARY KEY,    -- provider-side ID
  connection_id TEXT NOT NULL REFERENCES connections(id),
  zone_id       TEXT NOT NULL,
  name          TEXT NOT NULL,       -- full domain
  type          TEXT NOT NULL,       -- A | CNAME | TXT
  value         TEXT NOT NULL,
  proxied       INTEGER DEFAULT 0,
  ttl           INTEGER,
  route_id      TEXT REFERENCES routes(id),
  synced_at     INTEGER NOT NULL
);

-- Tunnel ingress rules
CREATE TABLE tunnel_rules (
  id            TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id),
  tunnel_id     TEXT NOT NULL,
  hostname      TEXT NOT NULL,
  service       TEXT NOT NULL,       -- e.g. http://localhost:2015
  route_id      TEXT REFERENCES routes(id),
  created_at    INTEGER NOT NULL
);

-- Monitoring monitors
CREATE TABLE monitors (
  id            TEXT PRIMARY KEY,    -- provider-side ID
  connection_id TEXT NOT NULL REFERENCES connections(id),
  route_id      TEXT NOT NULL REFERENCES routes(id),
  url           TEXT NOT NULL,
  status        TEXT,                -- up | down | paused | pending
  last_check    INTEGER,
  provider_url  TEXT                 -- link to monitor in provider UI
);

-- Route chain node cache
CREATE TABLE chain_nodes (
  id            TEXT PRIMARY KEY,
  route_id      TEXT NOT NULL REFERENCES routes(id),
  node_type     TEXT NOT NULL,
  label         TEXT NOT NULL,
  status        TEXT NOT NULL,
  detail        TEXT,
  warning       TEXT,
  provider      TEXT,
  last_check    INTEGER NOT NULL
);

-- GeoIP ban list
CREATE TABLE ip_bans (
  ip            TEXT PRIMARY KEY,
  reason        TEXT NOT NULL,
  rule_name     TEXT,
  banned_at     INTEGER NOT NULL,
  expires_at    INTEGER,
  route_id      TEXT REFERENCES routes(id),
  permanent     INTEGER DEFAULT 0
);

-- Fail2ban rules
CREATE TABLE fail2ban_rules (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  config        TEXT NOT NULL,       -- JSON: filter + threshold + window + ban_duration
  enabled       INTEGER DEFAULT 1,
  hit_count     INTEGER DEFAULT 0,
  created_at    INTEGER NOT NULL
);

-- Route templates
CREATE TABLE route_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  config        TEXT NOT NULL,       -- JSON: partial RouteConfig
  built_in      INTEGER DEFAULT 0,
  created_at    INTEGER NOT NULL
);

-- API keys
CREATE TABLE api_keys (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL,       -- SHA256 of key, never store plaintext
  scopes        TEXT NOT NULL,       -- JSON array of scope strings
  last_used     INTEGER,
  expires_at    INTEGER,
  created_at    INTEGER NOT NULL
);

-- Users (Teams tier)
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                -- NULL if SSO-only
  role          TEXT NOT NULL DEFAULT 'viewer',
  sso_provider  TEXT,
  sso_subject   TEXT,
  created_at    INTEGER NOT NULL,
  last_login    INTEGER
);

-- Route ownership (Teams tier)
CREATE TABLE route_ownership (
  route_id      TEXT PRIMARY KEY REFERENCES routes(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  assigned_at   INTEGER NOT NULL
);

-- Pending approvals (Teams tier)
CREATE TABLE pending_changes (
  id            TEXT PRIMARY KEY,
  action        TEXT NOT NULL,       -- route.create | route.update | route.delete
  payload       TEXT NOT NULL,       -- JSON
  requested_by  TEXT NOT NULL REFERENCES users(id),
  requested_at  INTEGER NOT NULL,
  approved_by   TEXT REFERENCES users(id),
  approved_at   INTEGER,
  status        TEXT DEFAULT 'pending'  -- pending | approved | rejected | expired
);

-- SLO config
CREATE TABLE route_slos (
  route_id      TEXT PRIMARY KEY REFERENCES routes(id),
  p95_target_ms INTEGER NOT NULL,
  p99_target_ms INTEGER,
  window_days   INTEGER DEFAULT 30,
  alert_on_breach INTEGER DEFAULT 1
);

-- SLO compliance history (daily rollup)
CREATE TABLE slo_compliance (
  route_id      TEXT NOT NULL REFERENCES routes(id),
  date          TEXT NOT NULL,       -- YYYY-MM-DD
  p95_actual_ms INTEGER,
  p99_actual_ms INTEGER,
  p95_compliant INTEGER,             -- 1 | 0
  p99_compliant INTEGER,
  sample_count  INTEGER,
  PRIMARY KEY (route_id, date)
);

-- Anomaly baselines
CREATE TABLE anomaly_baselines (
  route_id      TEXT NOT NULL REFERENCES routes(id),
  metric        TEXT NOT NULL,       -- req_per_min | error_rate | p95_latency
  hour_of_week  INTEGER NOT NULL,    -- 0-167 (7 days * 24 hours)
  mean          REAL NOT NULL,
  stddev        REAL NOT NULL,
  sample_count  INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (route_id, metric, hour_of_week)
);
```

---

---

## 18. API Surface Additions

New tRPC routers:

```typescript
// connections router
connections.list()
connections.get(id)
connections.create(type, name, credentials, config)
connections.updateCredentials(id, credentials)
connections.delete(id)
connections.test(id)
connections.sync(id)
connections.getSyncLog(id, limit?)

// dns router
dns.listRecords(connectionId, zoneId?)
dns.createRecord(connectionId, zoneId, type, name, value)
dns.deleteRecord(connectionId, recordId)
dns.syncRecords(connectionId)
dns.getRecordForRoute(routeId)

// tunnels router
tunnels.list(connectionId)
tunnels.getIngressRules(connectionId, tunnelId)
tunnels.addRoute(routeId, tunnelId)
tunnels.removeRoute(routeId)

// chain router
chain.getForRoute(routeId)
chain.debugRoute(routeId)
chain.refreshNode(routeId, nodeType)

// monitors router
monitors.listForRoute(routeId)
monitors.createForRoute(routeId, connectionId, config?)
monitors.pauseForRoute(routeId)
monitors.deleteForRoute(routeId)

// security router
security.getGeoIPConfig(routeId)
security.setGeoIPConfig(routeId, config)
security.getBotChallengeConfig(routeId)
security.setBotChallengeConfig(routeId, config)
security.listBans()
security.unban(ip)
security.listFail2banRules()
security.createFail2banRule(config)
security.deleteFail2banRule(id)
security.getMTLSConfig(routeId)
security.setMTLSConfig(routeId, config)
security.issueMTLSClientCert(routeId, commonName)
security.revokeMTLSClientCert(routeId, certId)

// templates router
templates.list()
templates.get(id)
templates.create(config)
templates.update(id, config)
templates.delete(id)
templates.applyToRoute(templateId, routeId)

// slos router
slos.get(routeId)
slos.set(routeId, config)
slos.getCompliance(routeId, days?)

// apikeys router (Teams)
apikeys.list()
apikeys.create(name, scopes, expiresAt?)
apikeys.revoke(id)

// users router (Teams)
users.list()
users.invite(email, role)
users.updateRole(id, role)
users.remove(id)

// approvals router (Teams)
approvals.list(status?)
approvals.approve(id)
approvals.reject(id, reason?)
```

New REST endpoints:

```
GET  /api/v1/routes                    (API key auth)
POST /api/v1/routes                    (API key auth, routes scope)
GET  /api/v1/routes/:id/chain          (API key auth, read scope)
POST /api/v1/scanner/scan              (API key auth, routes scope)
GET  /api/v1/connections               (API key auth, connections scope)
POST /api/v1/connections/:id/sync      (API key auth, connections scope)
GET  /metrics                          (Prometheus scrape, optional token)
```

---

---

## 19. Monorepo Changes

```
proxyos/
├── apps/
│   ├── web/                            # Central dashboard (existing)
│   └── agent/                          # Agent (V2)
│
├── packages/
│   ├── db/                             # existing: Drizzle schema + V3 migrations
│   ├── api/                            # existing: tRPC router + new V3 routers
│   ├── caddy/                          # existing: Caddy Admin API client
│   ├── sso/                            # existing: SSO forward_auth builders
│   ├── analytics/                      # existing: log parser + time-series
│   ├── federation/                     # V2: WS protocol types
│   ├── importers/                      # V2: reverse proxy importers
│   ├── scanner/                        # V2: Docker scanner
│   ├── types/                          # existing
│   │
│   ├── connect/                        # NEW V3: connection adapter system
│   │   ├── event-bus.ts                # internal event bus
│   │   ├── types.ts                    # ConnectionAdapter interface, ChainNode
│   │   ├── registry.ts                 # adapter registry + lifecycle
│   │   ├── credentials.ts             # AES-256-GCM encrypt/decrypt
│   │   │
│   │   ├── cloudflare/
│   │   │   ├── index.ts               # CloudflareAdapter (main)
│   │   │   ├── dns.ts                 # DNS management
│   │   │   ├── tunnel.ts              # Tunnel management
│   │   │   ├── waf.ts                 # WAF rules
│   │   │   ├── analytics.ts           # Analytics overlay
│   │   │   └── access.ts              # Zero Trust / Access
│   │   │
│   │   ├── authentik/
│   │   │   └── index.ts               # Authentik outpost + app management
│   │   │
│   │   ├── authelia/
│   │   │   └── index.ts               # Authelia config writer
│   │   │
│   │   ├── keycloak/
│   │   │   └── index.ts               # Keycloak client management
│   │   │
│   │   ├── zitadel/
│   │   │   └── index.ts               # Zitadel app management
│   │   │
│   │   ├── dns/
│   │   │   ├── hetzner.ts
│   │   │   ├── route53.ts
│   │   │   └── namecheap.ts
│   │   │
│   │   ├── tunnels/
│   │   │   ├── tailscale-funnel.ts
│   │   │   └── wireguard-monitor.ts
│   │   │
│   │   ├── monitoring/
│   │   │   ├── uptime-kuma.ts
│   │   │   ├── betterstack.ts
│   │   │   └── freshping.ts
│   │   │
│   │   └── notifications/
│   │       ├── zulip.ts
│   │       ├── slack.ts
│   │       ├── webhook.ts
│   │       └── smtp.ts
│   │
│   ├── security/                       # NEW V3: proxy-layer security
│   │   ├── geoip.ts                   # MaxMind GeoLite2 + Caddy IP matcher
│   │   ├── fail2ban.ts                # log watcher + auto-ban engine
│   │   ├── mtls.ts                    # mTLS cert management
│   │   ├── jwt-validator.ts           # JWT config builder for Caddy
│   │   └── exit-node-blocker.ts      # Tor/VPN/datacenter blocklists
│   │
│   ├── intelligence/                   # NEW V3: traffic intelligence
│   │   ├── anomaly-detector.ts        # rolling baseline + std dev alerting
│   │   ├── slo-tracker.ts             # SLO compliance rolling window
│   │   └── trend-analyser.ts          # latency trend detection
│   │
│   └── chain/                          # NEW V3: service chain view
│       ├── builder.ts                  # assembles ChainNode[] for a route
│       ├── debugger.ts                 # live end-to-end chain probe
│       └── health.ts                   # chain health rollup
│
├── docker-compose.yml                  # existing Central
├── docker-compose.agent.yml            # V2 Agent
└── .env.example
```

---

---

## 20. Build Order

V3 has hard dependencies: Connect system must be built before any adapters, chain view depends on adapters, new expose wizard depends on chain.

```
Phase 1 — Connect foundation (no adapters yet)
  1.1  packages/connect/event-bus.ts
  1.2  packages/connect/types.ts + registry.ts
  1.3  packages/connect/credentials.ts (AES-256-GCM)
  1.4  DB schema V3 migrations
  1.5  Connections tRPC router (stub — list/create/delete, no adapter logic yet)
  1.6  Connections UI (/connections list + /connections/new picker)

Phase 2 — Cloudflare adapter (highest ROI)
  2.1  packages/connect/cloudflare/dns.ts
  2.2  DNS shadow table sync
  2.3  Route hooks: onRouteCreated → create DNS record
  2.4  DNS health in chain view
  2.5  "Fix DNS" button in route detail
  2.6  packages/connect/cloudflare/tunnel.ts
  2.7  Tunnel ingress rule management
  2.8  packages/connect/cloudflare/waf.ts (GeoIP, bot fight, rate limit)
  2.9  packages/connect/cloudflare/analytics.ts (overlay on analytics page)
  2.10 packages/connect/cloudflare/access.ts (Zero Trust)

Phase 3 — Identity providers (closes SSO loop)
  3.1  packages/connect/authentik/index.ts (outpost + app auto-config)
  3.2  Update expose wizard SSO step to trigger Authentik auto-config
  3.3  packages/connect/authelia/index.ts
  3.4  packages/connect/keycloak/index.ts
  3.5  packages/connect/zitadel/index.ts

Phase 4 — Monitoring connections
  4.1  packages/connect/monitoring/uptime-kuma.ts
  4.2  Update expose wizard Step 6 (monitoring)
  4.3  Monitor sync on first connect
  4.4  Alert deduplication (upstream.down + monitor down = one alert)
  4.5  packages/connect/monitoring/betterstack.ts
  4.6  packages/connect/monitoring/freshping.ts

Phase 5 — Notification channels
  5.1  packages/connect/notifications/zulip.ts (your stack first)
  5.2  packages/connect/notifications/webhook.ts (upgraded)
  5.3  packages/connect/notifications/slack.ts
  5.4  Webhook log UI

Phase 6 — Chain view
  6.1  packages/chain/builder.ts (assembles nodes from all adapters)
  6.2  packages/chain/health.ts (status rollup)
  6.3  Chain view in route detail side panel
  6.4  Chain health dots in route table
  6.5  packages/chain/debugger.ts (live end-to-end probe)
  6.6  Debug chain UI

Phase 7 — V3 Expose wizard
  7.1  Step 3 (routing path) — Tunnel picker
  7.2  Step 2 (DNS auto-create) — Cloudflare DNS integration
  7.3  Step 4 (access) — SSO auto-configure + Cloudflare security
  7.4  Step 6 (monitoring) — monitoring connection auto-create
  7.5  Step 7 (review) — full chain preview
  7.6  Post-expose chain status (real-time formation)

Phase 8 — Security layer
  8.1  packages/security/geoip.ts + MaxMind DB bundling
  8.2  Per-route GeoIP UI
  8.3  packages/security/fail2ban.ts + log watcher
  8.4  Fail2ban rules UI + ban log
  8.5  packages/security/mtls.ts + cert issuance
  8.6  packages/security/jwt-validator.ts
  8.7  packages/security/exit-node-blocker.ts
  8.8  Bot challenge (Turnstile)

Phase 9 — Traffic intelligence
  9.1  packages/intelligence/anomaly-detector.ts
  9.2  packages/intelligence/slo-tracker.ts + SLO UI
  9.3  packages/intelligence/trend-analyser.ts
  9.4  A/B traffic splitting UI (Caddy lb_policy)
  9.5  Smart routing rules UI (path/header/query matchers)
  9.6  Request/response transformations UI
  9.7  Real-time traffic heatmap (/analytics/live)
  9.8  Slow request log
  9.9  Bandwidth billing view

Phase 10 — Observability
  10.1  Prometheus exporter (/metrics)
  10.2  Grafana dashboard JSON
  10.3  Request tracing (X-Request-ID)
  10.4  CT monitoring (crt.sh poller)
  10.5  Certificate health score
  10.6  Multi-domain cert management
  10.7  ACME account management

Phase 11 — Developer tooling
  11.1  REST API v1 + API key management
  11.2  Route templates (built-in + user-created)
  11.3  CLI (proxyos binary)
  11.4  Compose label watcher
  11.5  Terraform provider (separate repo)

Phase 12 — Teams (Cloud tier)
  12.1  User accounts + roles
  12.2  Dashboard SSO (login via Authentik/Google/GitHub)
  12.3  Route ownership
  12.4  Change approvals
  12.5  Org → site → agent hierarchy (Cloud only)

Phase 13 — Homelab OS integrations
  13.1  InfraOS bidirectional (ios expose → ProxyOS route)
  13.2  BackupOS auto-registration
  13.3  LockBoxOS credential storage
  13.4  MxWatch domain flagging
  13.5  PatchOS agent version tracking + auto-rollback
```

Total V3 estimated complexity: **8–12 weeks** focused build from V2 complete.

---

## Version summary

| Version | Tagline | Core value |
|---|---|---|
| V1 | Caddy with a good UI | Route CRUD, TLS, SSO, analytics |
| V2 | Federation + migration | Multi-agent, import, scanner |
| V3 | Own the whole chain | Connections, service chain view, security layer, full automation |

---

*ProxyOS V3 Spec — proxyos.app — Homelab OS family — April 2026*
