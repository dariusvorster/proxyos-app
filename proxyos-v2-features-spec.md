# ProxyOS — V2 Feature Spec
## Federation · Import · Docker Scanner

**Version:** 2.0 Draft  
**Date:** April 2026  
**Status:** Pre-implementation spec  
**Part of:** Homelab OS family (proxyos.app)

---

## Table of Contents

1. [Feature 1 — Federated Central Manager + Agents](#feature-1--federated-central-manager--agents)
2. [Feature 2 — Import from Other Reverse Proxies](#feature-2--import-from-other-reverse-proxies)
3. [Feature 3 — Docker / Podman Label Scanner](#feature-3--docker--podman-label-scanner)
4. [Monorepo Changes](#monorepo-changes)
5. [Database Schema Additions](#database-schema-additions)
6. [API Surface Additions](#api-surface-additions)
7. [UI Surface Additions](#ui-surface-additions)
8. [Build Order](#build-order)

---

---

# Feature 1 — Federated Central Manager + Agents

## Overview

ProxyOS V2 introduces a hub-and-spoke federation model. A single **Central** instance becomes the authoritative manager for N **Agent** instances running in other environments — different Docker hosts, different VLANs, remote sites, VPS nodes, or other homelabs. Central holds the source-of-truth SQLite DB. Agents are stateless between connections and fully rebuild from Central on reconnect.

This unlocks the $29/mo Teams tier, makes ProxyOS viable for multi-site homelabs, and is the architectural foundation for ProxyOS Cloud.

---

## Topology Model

```
ProxyOS Central (manager node)
│   SQLite DB (authoritative)
│   Dashboard UI
│   tRPC API
│
├── Agent: homelab-primary    (same LAN,   192.168.69.x)
├── Agent: homelab-secondary  (same LAN,   192.168.80.x)
├── Agent: vps-racknerd       (WireGuard,  10.7.0.x)
├── Agent: hetzner-prod       (Tailscale,  100.x.x.x)
└── Agent: client-site-A      (Cloudflare Tunnel)
```

Each Agent:
- Runs Caddy + a lightweight ProxyOS Agent sidecar
- Connects to Central over authenticated WebSocket
- Receives route/config push events from Central
- Streams metrics, logs, and health back to Central
- Rebuilds full Caddy state from Central on reconnect
- Has zero local UI — managed entirely from Central

---

## Connectivity Options

Agents reach Central through whichever network path is available:

| Method | Use Case | Notes |
|---|---|---|
| **Direct TLS** | Same LAN or site-to-site VPN | Fastest, lowest overhead |
| **Tailscale** | Cross-network homelab nodes | Already used in your stack (Dockee01/02/03, Orin, llm-tools) |
| **WireGuard** | VPS/remote sites | Already used for RackNerd relay |
| **Cloudflare Tunnel** | Outbound-only agents, no inbound port | Agent connects out, no firewall rules needed |
| **ProxyOS Cloud relay** | Cloud tier — agent phones home to managed Central | V3 / Cloud tier only |

Central listens on a single dedicated port (default `7890`) for agent WebSocket connections. This port is separate from the dashboard UI port (`3000`) and Caddy admin API (`2019`).

---

## Agent Architecture

The agent is a **single lightweight Node.js or Go binary** — `proxyos-agent`. It does not include Next.js, the dashboard, or tRPC. It is designed to be small (<20MB Docker image layer).

### Agent responsibilities

```
proxyos-agent
├── WebSocket client → Central
│   ├── Authenticate with agent token (JWT, signed by Central)
│   ├── Receive config push (full route set on connect, diffs on change)
│   ├── Apply config to local Caddy via JSON Admin API
│   └── Confirm apply with ack message
├── Metrics collector
│   ├── Poll Caddy /metrics or parse access logs
│   ├── Aggregate: req/s, error rate, p95 latency, bandwidth per route
│   └── Push to Central every 30s (configurable)
├── Health reporter
│   ├── Caddy process status
│   ├── Upstream health check results
│   └── Cert expiry per domain
└── Log streamer
    ├── Tail Caddy structured JSON access log
    └── Stream last N lines to Central on request (live tail)
```

### Agent startup sequence

```
1. Start Caddy with minimal base config (empty routes)
2. proxyos-agent starts
3. Agent reads local config: CENTRAL_URL, AGENT_TOKEN, AGENT_ID
4. Agent connects to Central WebSocket
5. Central authenticates token → sends full route config for this agent
6. Agent applies full config to Caddy via JSON Admin API
7. Agent sends READY ack
8. Central marks agent as online
9. Agent enters steady-state: receive diffs, push metrics, stream logs
```

### Agent reconnect behaviour

On disconnect (network drop, Central restart, etc.):

```
1. Agent enters reconnect loop with exponential backoff (1s → 2s → 4s → max 60s)
2. Caddy continues serving with last known config (no disruption)
3. On reconnect, Central sends full config diff since last_sync_timestamp
4. Agent applies diff
5. If diff fails or timestamps are ambiguous → Agent requests full resync
```

This means **agent downtime = zero Caddy downtime**. Services keep running on the last pushed config. Only new route changes are delayed until reconnect.

---

## Central Architecture Changes

Central gains a **Federation Manager** service alongside the existing tRPC API:

```
apps/web/
├── server/
│   ├── trpc/           # existing
│   ├── federation/     # NEW
│   │   ├── ws-server.ts        # WebSocket server on port 7890
│   │   ├── agent-registry.ts   # In-memory agent state (online/offline/last-seen)
│   │   ├── config-push.ts      # Builds and sends config payloads to agents
│   │   ├── metrics-collector.ts # Receives + stores agent metrics in SQLite
│   │   └── log-broker.ts       # Proxies live log streams to dashboard clients
```

### WebSocket message protocol

All messages are JSON with a `type` field. Direction noted as `C→A` (Central to Agent) or `A→C` (Agent to Central).

```typescript
// C→A: Full config push (on connect or full resync request)
{
  type: "config.full",
  routes: Route[],
  sso_providers: SSOProvider[],
  tls_config: TLSConfig,
  timestamp: number
}

// C→A: Config diff (on route change)
{
  type: "config.diff",
  added: Route[],
  updated: Route[],
  removed: string[],  // route IDs
  timestamp: number
}

// A→C: Acknowledge config apply
{
  type: "config.ack",
  timestamp: number,
  success: boolean,
  error?: string
}

// A→C: Metrics push (every 30s)
{
  type: "metrics.push",
  agent_id: string,
  timestamp: number,
  routes: {
    [route_id: string]: {
      req_per_min: number,
      error_rate: number,
      p95_latency_ms: number,
      bytes_in: number,
      bytes_out: number
    }
  },
  system: {
    caddy_status: "running" | "stopped" | "error",
    caddy_version: string,
    uptime_seconds: number
  }
}

// A→C: Health report (every 60s)
{
  type: "health.report",
  agent_id: string,
  upstreams: { [route_id: string]: "healthy" | "degraded" | "down" },
  certs: { [domain: string]: { expiry_days: number, issuer: string } }
}

// A→C: Log line (streamed on demand)
{
  type: "log.line",
  agent_id: string,
  route_id: string,
  line: CaddyAccessLogEntry
}

// A→C: Request full resync
{
  type: "config.resync_request",
  agent_id: string,
  reason: string
}

// C→A: Ping / A→C: Pong (keepalive every 15s)
{ type: "ping" } / { type: "pong" }
```

---

## Agent Registration Flow

New agents are registered from the Central dashboard:

```
1. User opens Central UI → Agents → "Add Agent"
2. User provides: agent name, site tag, description
3. Central generates: agent_id (UUID), agent_token (signed JWT, 1yr expiry)
4. UI shows install snippet:

   docker run -d \
     --name proxyos-agent \
     --network host \
     -e CENTRAL_URL=https://proxy.homelabza.com \
     -e AGENT_TOKEN=eyJhbGc... \
     -e AGENT_ID=ag_01jt... \
     ghcr.io/proxyos/agent:latest

5. User runs snippet on target host
6. Agent connects to Central
7. Central marks agent as "online", shows in dashboard
```

Agent token is a JWT containing: `agent_id`, `issued_at`, `expires_at`, `central_fingerprint` (SHA256 of Central's TLS cert — prevents token reuse against a different Central).

---

## Route Assignment Model

Routes in the federated model have an `agent_id` field. A route is owned by exactly one agent (or `null` for local/Central's own Caddy instance).

```
Central DB: routes table
├── id
├── agent_id        ← NULL = local, ag_xxx = remote agent
├── domain
├── upstream
├── sso_enabled
├── ...
```

From the Central dashboard, the user can:
- Create a route and assign it to any agent
- Move a route between agents (Central pushes remove to old agent, add to new)
- Clone a route across multiple agents simultaneously (for HA or mirroring)
- View all routes across all agents in a unified table with an "Agent" column

---

## Site Tags

Agents can be grouped into named sites:

```
Sites:
├── homelab          [homelab-primary, homelab-secondary]
├── production       [hetzner-prod]
├── relay            [vps-racknerd]
└── client           [client-site-A]
```

Site tags are used for:
- Filtering the global route table
- Bulk operations (push same route to all agents in a site)
- Alert grouping (alert fires per-site, not per-agent)
- Dashboard overview cards

---

## Central Dashboard — New Views

### Agents page (`/agents`)
- Table: agent name, site, status (online/offline), last seen, Caddy version, route count, cert count
- Click agent → agent detail page
- Agent detail: routes assigned, live metrics, cert list, log viewer, health status

### Global routes page (`/routes?view=all`)
- Existing routes table gains "Agent" column
- Filter by agent, site, SSO status, TLS mode
- Bulk assign / bulk enable-disable

### Federation health widget (dashboard home)
- Card per site showing: agents online/total, routes active, any alerts

---

## Security Model

- All agent↔Central communication is TLS (Central serves WSS, not WS)
- Agent tokens are JWTs — Central validates signature + expiry on every connection
- Token revocation: Central maintains a `revoked_tokens` table, checked on auth
- Agents cannot modify Central DB directly — all state flows Central → Agent
- Agents authenticate with token only — no username/password
- Central should be behind ProxyOS's own proxy with SSO enabled (eat your own dog food)

---

## Failure Modes

| Scenario | Behaviour |
|---|---|
| Agent loses network | Caddy keeps serving. Agent reconnects with backoff. On reconnect, receives diff. |
| Central goes down | All agents keep serving last config. No new route changes possible until Central recovers. |
| Agent Caddy crashes | Agent reports `caddy_status: stopped` to Central. Alert fires. Agent attempts Caddy restart. |
| Config push fails on agent | Agent sends `config.ack { success: false, error: "..." }`. Central marks route as `pending` on that agent. Alert fires. Central retries on next push. |
| Agent token expired | Connection refused. User must re-register agent (generate new token, redeploy). |
| Split-brain (agent has stale routes) | Agent requests full resync via `config.resync_request`. Central sends `config.full`. |

---

## Monorepo additions for Feature 1

```
proxyos/
├── apps/
│   ├── web/                    # existing Central dashboard
│   └── agent/                  # NEW: proxyos-agent
│       ├── src/
│       │   ├── index.ts        # entry point
│       │   ├── ws-client.ts    # WebSocket connection to Central
│       │   ├── caddy-sync.ts   # applies config pushes to local Caddy
│       │   ├── metrics.ts      # collects + pushes metrics
│       │   ├── health.ts       # health checks + cert expiry
│       │   └── log-streamer.ts # tails Caddy logs, streams to Central
│       ├── Dockerfile
│       └── package.json
├── packages/
│   ├── federation/             # NEW: shared types for ws protocol
│   │   ├── messages.ts         # all WS message types (shared by Central + Agent)
│   │   └── constants.ts
│   └── ...existing...
```

---

---

# Feature 2 — Import from Other Reverse Proxies

## Overview

Users migrating to ProxyOS from another reverse proxy should be able to import their existing route configuration with minimal manual work. The importer parses the source proxy's config, presents a preview of detected routes, allows the user to review/deselect, then creates ProxyOS routes in bulk.

Supported sources for V2:

| Source | Method | Fidelity |
|---|---|---|
| **Nginx** | Parse `nginx.conf` + `sites-enabled/` | High |
| **Nginx Proxy Manager** | Read SQLite or MySQL DB directly | Very high |
| **Traefik** | Parse YAML/TOML config + Docker labels, or live REST API | High |
| **Caddy** | Pull JSON config from Admin API (`:2019/config/`) | Perfect (native format) |
| **Apache** | Parse `.conf` files | Medium |
| **HAProxy** | Parse `haproxy.cfg` | Medium |

---

## Import Flow (UI)

The import wizard is a 4-step modal:

```
Step 1: Source selection
  → Pick source type (Nginx / NPM / Traefik / Caddy / Apache / HAProxy)
  → Provide input: file upload, DB connection string, or live API URL

Step 2: Parse + preview
  → ProxyOS parses the source
  → Shows detected routes in a table:
     Domain | Upstream | SSL | Auth | Status
     app.example.com | 192.168.1.10:3000 | ✓ | None | Ready to import
     api.example.com | 192.168.1.11:8080 | ✓ | Basic | Needs review ⚠
     internal.local  | 192.168.1.12:9000 | ✗ | None | Ready to import
  → User can deselect rows, or click a row to edit before import
  → Warnings shown for: missing upstream, conflicting domain, unsupported auth type

Step 3: Options
  → Assign imported routes to an agent (or local)
  → Default TLS mode for imported routes (auto / dns / internal / keep original)
  → Default SSO: none / prompt per route / apply to all
  → "Dry run" toggle — validate without committing

Step 4: Review + import
  → Summary: N routes will be created, M skipped, K need manual review
  → "Import" button
  → Progress bar (each route created via Caddy JSON API)
  → Import report: success/fail per route, downloadable as JSON
```

---

## Parser Implementations

### 2.1 Nginx Parser

Parses Nginx config files using a hand-written parser (no external deps — Nginx config grammar is simple enough).

**Extracts from each `server {}` block:**
- `server_name` → domain
- `proxy_pass` → upstream URL
- `ssl_certificate` / `ssl_certificate_key` → TLS present (flag, don't import certs)
- `auth_basic` → flag as basic auth (unsupported in V1, warn user)
- `auth_request` → flag as external auth (map to SSO toggle if URL matches Authentik/Authelia)
- `location /` block → path prefix
- `proxy_set_header` → extract forwarded headers

```typescript
// packages/importers/nginx/parser.ts

interface NginxServerBlock {
  serverNames: string[]
  listen: number[]
  ssl: boolean
  proxyPass?: string
  authBasic?: string
  authRequest?: string
  locations: NginxLocation[]
}

function parseNginxConfig(content: string): NginxServerBlock[]
function nginxBlockToProxyOSRoute(block: NginxServerBlock): ImportedRoute
```

**Input:** Single `nginx.conf` file or zip of `sites-enabled/` directory (file upload).

---

### 2.2 Nginx Proxy Manager (NPM) Importer

NPM stores its state in a SQLite DB (`database.sqlite`) or MySQL. Direct DB read gives much higher fidelity than config file parsing.

**Tables read:**
- `proxy_host` — domain, forward_host, forward_port, ssl_forced, caching_enabled, block_exploits
- `access_list` — IP allowlists linked to proxy hosts
- `certificate` — cert metadata (not the cert files, just presence/type)

```typescript
// packages/importers/npm/db-reader.ts

interface NPMProxyHost {
  id: number
  domain_names: string[]       // JSON array
  forward_scheme: string       // http / https
  forward_host: string
  forward_port: number
  ssl_forced: boolean
  access_list_id: number | null
  meta: object                 // includes Let's Encrypt details
}

function readNPMDatabase(dbPath: string): NPMProxyHost[]
function npmHostToProxyOSRoute(host: NPMProxyHost): ImportedRoute
```

**Input:** File upload of `database.sqlite`, or MySQL connection string.

---

### 2.3 Traefik Importer

Two modes:

**Mode A — Static config file:**  
Parse `traefik.yml` (YAML) or `traefik.toml` (TOML). Extract `routers`, `services`, `middlewares` from `http:` section.

**Mode B — Live API:**  
If Traefik is running, hit `http://<host>:8080/api/http/routers` and `http://<host>:8080/api/http/services`. Returns full router+service config as JSON — zero parsing ambiguity.

**Mode C — Docker labels:**  
Connect to Docker socket or Docker API, scan running containers for `traefik.*` labels. Extract `traefik.http.routers.*.rule` (Host matcher), `traefik.http.services.*.loadbalancer.server.port`.

```typescript
// packages/importers/traefik/

// api-reader.ts
async function fetchTraefikRouters(apiUrl: string): Promise<TraefikRouter[]>
async function fetchTraefikServices(apiUrl: string): Promise<TraefikService[]>

// label-scanner.ts — shared with Feature 3 (Docker scanner)
async function scanDockerForTraefikLabels(dockerSocketPath: string): Promise<ImportedRoute[]>

// config-parser.ts
function parseTraefikYAML(content: string): TraefikConfig
function parseTraefikTOML(content: string): TraefikConfig
function traefikRouterToProxyOSRoute(router: TraefikRouter, services: TraefikService[]): ImportedRoute
```

**Middleware mapping:**

| Traefik Middleware | ProxyOS equivalent |
|---|---|
| `basicAuth` | Basic auth (warn: unsupported V1, flagged) |
| `forwardAuth` | SSO toggle (map URL to Authentik/Authelia if recognized) |
| `rateLimit` | Rate limit (map requests/period) |
| `ipAllowList` | IP allowlist |
| `compress` | Compression toggle |
| `headers` | Custom headers (partial support) |

---

### 2.4 Caddy Importer

The simplest importer — Caddy's JSON Admin API returns config in a format ProxyOS already understands natively.

```typescript
// packages/importers/caddy/api-reader.ts

async function fetchCaddyConfig(adminUrl: string): Promise<CaddyConfig>
// GET http://<host>:2019/config/

function caddyRouteToProxyOSRoute(caddyRoute: CaddyRoute): ImportedRoute
// Near 1:1 mapping since ProxyOS already speaks Caddy JSON
```

**Input:** Admin API URL (e.g. `http://192.168.69.10:2019`). Caddy admin API is localhost-only by default — user may need to bind it to LAN IP or use SSH tunnel.

Also supports **Caddyfile upload** — parse Caddyfile syntax → intermediate AST → ProxyOS routes. Lower priority than API mode.

---

### 2.5 Apache Importer

Parses Apache `VirtualHost` blocks from `.conf` files.

**Extracts:**
- `ServerName` / `ServerAlias` → domain
- `ProxyPass` / `ProxyPassReverse` → upstream
- `SSLEngine on` → TLS present
- `AuthType Basic` → basic auth flag
- `Require ip` → IP allowlist

```typescript
// packages/importers/apache/parser.ts

interface ApacheVirtualHost {
  serverName: string
  serverAliases: string[]
  port: number
  ssl: boolean
  proxyPass?: string
  proxyPassReverse?: string
  authType?: string
  requireIp?: string[]
}

function parseApacheConfig(content: string): ApacheVirtualHost[]
function apacheVhostToProxyOSRoute(vhost: ApacheVirtualHost): ImportedRoute
```

**Input:** File upload of single `.conf` or zip of `sites-enabled/`.

---

### 2.6 HAProxy Importer

Parses `haproxy.cfg` frontend/backend blocks.

**Extracts:**
- `frontend` block: `bind` port, `acl host_match hdr(host) -i` → domain
- `use_backend` → links frontend to backend
- `backend` block: `server` lines → upstream IPs/ports

HAProxy config often has complex ACL logic — the importer handles simple single-domain frontends cleanly, flags complex multi-ACL frontends as "needs manual review".

```typescript
// packages/importers/haproxy/parser.ts

interface HAProxyFrontend {
  name: string
  bind: string
  hostAcls: string[]     // domain names from hdr(host) ACLs
  defaultBackend?: string
  useBackend: { acl: string, backend: string }[]
}

interface HAProxyBackend {
  name: string
  servers: { name: string, host: string, port: number }[]
}

function parseHAProxyConfig(content: string): { frontends: HAProxyFrontend[], backends: HAProxyBackend[] }
function haproxyPairToProxyOSRoute(frontend: HAProxyFrontend, backend: HAProxyBackend): ImportedRoute | null
```

---

## Shared ImportedRoute Type

All parsers produce a normalized `ImportedRoute` before the preview step:

```typescript
// packages/importers/types.ts

interface ImportedRoute {
  // Core
  domain: string
  upstream: string               // host:port
  protocol: "http" | "https"

  // TLS
  tlsDetected: boolean           // source had SSL/TLS
  suggestedTlsMode: TLSMode      // auto / dns / internal / off

  // Access
  ssoDetected: boolean
  ssoProvider?: string           // "authentik" | "authelia" | "unknown"
  ssoUrl?: string                // original forward_auth URL
  basicAuthDetected: boolean
  ipAllowlist?: string[]

  // Options
  compressionDetected: boolean
  websocketDetected: boolean
  rateLimitDetected: boolean
  rateLimitRpm?: number

  // Import metadata
  sourceType: ImportSourceType
  sourceIdentifier: string       // e.g. "server_name app.example.com"
  confidence: "high" | "medium" | "low"
  warnings: string[]             // human-readable issues to review
  canAutoImport: boolean         // false if warnings are blocking
}
```

---

## Export (Reverse Direction)

While import handles migration in, export handles portability out — users should never feel locked in.

```
Routes → Export as:
├── Caddyfile
├── Nginx config (sites-available format)
├── Traefik docker-compose labels
├── ProxyOS JSON backup (full DB export, re-importable)
```

Export is single-route or all-routes. Available from route table → "Export" button, or `/settings/export`.

---

---

# Feature 3 — Docker / Podman Label Scanner

## Overview

The Docker scanner connects to a Docker or Podman socket (or remote Docker API), enumerates running containers, and auto-detects services that should be exposed through ProxyOS. It surfaces these as route suggestions the user can review and expose in one click — bridging the gap between "container running" and "service accessible at a domain."

This is the highest-leverage onboarding feature. New users can go from fresh ProxyOS install to all their services exposed in under 5 minutes.

---

## Detection Strategies

The scanner uses three detection strategies, applied in order of confidence:

### Strategy A — ProxyOS native labels (highest confidence)

Users can opt into explicit declaration via Docker labels:

```yaml
# docker-compose.yml
services:
  gitbay:
    image: gitbay:latest
    labels:
      proxyos.enable: "true"
      proxyos.domain: "gitbay.homelabza.com"
      proxyos.port: "3000"
      proxyos.tls: "dns"
      proxyos.sso: "authentik"
      proxyos.ratelimit: "100"
```

These map 1:1 to ProxyOS route fields. Confidence: **high**. No user review required (unless `proxyos.review: "true"` is set).

Full label reference:

| Label | Type | Description |
|---|---|---|
| `proxyos.enable` | bool | Include this container in scan results |
| `proxyos.domain` | string | Domain to expose on |
| `proxyos.port` | int | Container port to proxy to |
| `proxyos.protocol` | `http`/`https` | Upstream protocol (default: http) |
| `proxyos.tls` | `auto`/`dns`/`internal`/`off` | TLS mode |
| `proxyos.sso` | `authentik`/`authelia`/`none` | SSO provider |
| `proxyos.sso_url` | string | Override SSO provider URL |
| `proxyos.ratelimit` | int | Requests per minute |
| `proxyos.allowlist` | string | Comma-separated CIDR list |
| `proxyos.compress` | bool | Enable compression |
| `proxyos.websocket` | bool | Enable WebSocket upgrade |
| `proxyos.healthcheck` | string | Path for upstream health check |
| `proxyos.review` | bool | Force manual review even if all labels present |

---

### Strategy B — Traefik label compatibility (high confidence)

If a container has Traefik labels, the scanner imports them using the same logic as the Traefik importer (Feature 2, Mode C). This means users migrating from Traefik get zero-friction label reuse.

Key labels read:
- `traefik.enable: true`
- `traefik.http.routers.<name>.rule: Host(\`domain\`)`
- `traefik.http.services.<name>.loadbalancer.server.port: <port>`
- `traefik.http.routers.<name>.middlewares: <middleware-name>`

---

### Strategy C — Heuristic detection (medium confidence)

For containers with no proxy labels at all, the scanner applies heuristics:

1. **Port exposure** — containers with ports mapped to `127.0.0.1` or host-only (not `0.0.0.0`) are likely intended to be proxied
2. **Image name recognition** — known images suggest domains and ports:

```typescript
const KNOWN_IMAGES: Record<string, { suggestedPort: number, suggestedSubdomain: string }> = {
  "gitea/gitea":          { suggestedPort: 3000,  suggestedSubdomain: "git" },
  "ghcr.io/immich-app":  { suggestedPort: 2283,  suggestedSubdomain: "photos" },
  "portainer/portainer":  { suggestedPort: 9000,  suggestedSubdomain: "portainer" },
  "sonarqube":            { suggestedPort: 9000,  suggestedSubdomain: "sonar" },
  "n8nio/n8n":            { suggestedPort: 5678,  suggestedSubdomain: "n8n" },
  "vaultwarden/server":   { suggestedPort: 80,    suggestedSubdomain: "vault" },
  "zammad/zammad":        { suggestedPort: 3000,  suggestedSubdomain: "support" },
  "grafana/grafana":      { suggestedPort: 3000,  suggestedSubdomain: "grafana" },
  "uptime/kuma":          { suggestedPort: 3001,  suggestedSubdomain: "status" },
  "homarr":               { suggestedPort: 7575,  suggestedSubdomain: "home" },
  // ... extendable by user via settings
}
```

3. **Running service detection** — probe the container's exposed port for HTTP response. If it responds with HTTP 200/301/302, confidence rises to "medium-high". If it returns a recognizable app header (e.g. `X-Powered-By: Express`), note it.

4. **Existing route check** — if a container's port is already proxied through ProxyOS, mark it "already configured" and skip.

---

## Scanner Architecture

```typescript
// packages/scanner/docker/

interface DockerScannerConfig {
  socketPath?: string        // default: /var/run/docker.sock
  apiUrl?: string            // Docker remote API: http://192.168.69.x:2375
  podmanSocketPath?: string  // Podman: /run/user/1000/podman/podman.sock
  agentId?: string           // if scanning a remote agent's Docker host
  baseDomainsHint?: string[] // e.g. ["homelabza.com"] — used for subdomain suggestions
}

interface ScannedContainer {
  id: string
  name: string
  image: string
  status: string
  networks: ContainerNetwork[]
  ports: PortMapping[]
  labels: Record<string, string>
  detectedRoutes: DetectedRoute[]  // 0..N — a container can suggest multiple routes
}

interface DetectedRoute {
  container: ScannedContainer
  suggestedDomain: string
  suggestedUpstream: string    // container_ip:port
  strategy: "proxyos_labels" | "traefik_labels" | "heuristic"
  confidence: "high" | "medium" | "low"
  tlsMode: TLSMode
  ssoEnabled: boolean
  warnings: string[]
  alreadyConfigured: boolean
}

class DockerScanner {
  constructor(config: DockerScannerConfig)
  async scan(): Promise<ScannedContainer[]>
  async scanContainer(id: string): Promise<ScannedContainer>
  async watchForChanges(callback: (event: DockerEvent) => void): void
    // Listens to Docker events API for container start/stop
    // Triggers re-scan + notifies dashboard via WebSocket
}
```

---

## Upstream IP Resolution

When a container is on a Docker bridge network, ProxyOS needs to proxy to the container's IP, not `localhost`. The scanner resolves this correctly:

```typescript
function resolveUpstream(container: ScannedContainer, port: number): string {
  // Priority order:
  // 1. If ProxyOS is in the same Docker network → use container IP on that network
  // 2. If container has host port mapping → use 127.0.0.1:hostPort
  // 3. If container is on host network → use 127.0.0.1:port
  // 4. If remote agent → use agent host IP + host port mapping
}
```

This handles the common case where `localhost` doesn't work from inside a Docker bridge (the Cloudflare Tunnel pattern — use `172.17.0.1` not `localhost`).

---

## Compose File Scanner

Separate from the live Docker socket scanner, ProxyOS can also parse `docker-compose.yml` files offline:

```
UI: Settings → Import → "Parse Compose File" → upload docker-compose.yml
```

Reads all services, their `ports:` and `labels:`, applies the same detection strategies. Useful for:
- Pre-configuring routes before deploying a stack
- Reviewing what a new stack will need exposed
- Teams sharing compose files where proxy config is embedded in labels

---

## Auto-Watch Mode

When enabled, ProxyOS watches the Docker events API for container lifecycle events:

```
container start  → scan new container → if high-confidence proxyos labels → auto-create route
container stop   → mark route upstream as "container offline" (don't delete route)
container remove → optionally prompt: "Container removed, delete route?"
```

Auto-watch can be set to:
- **Notify only** — show dashboard notification, require user action
- **Auto-expose (labels only)** — auto-create routes for containers with `proxyos.enable: true` + full label set
- **Auto-expose (all high-confidence)** — auto-create routes for any high-confidence detection

Default: **Notify only**. Auto-expose requires explicit opt-in.

---

## Scanner UI

### Scan page (`/scan` or `/agents/<id>/scan`)

```
┌─────────────────────────────────────────────────────────┐
│  Docker Scanner                          [Scan Now] [⚙]  │
│  Last scan: 2 minutes ago · 12 containers · 3 new        │
├─────────────────────────────────────────────────────────┤
│  Container          Image           Suggestion           │
│  ─────────────────────────────────────────────────────  │
│  ✓ gitbay           gitbay:latest   gitbay.homelabza.com │
│    [Already configured]                                  │
│                                                          │
│  ● n8n              n8nio/n8n       n8n.homelabza.com    │
│    Port 5678 · No labels · Heuristic · [Review & Expose] │
│                                                          │
│  ● zammad_web       zammad:latest   support.homelabza.com│
│    ProxyOS labels · High confidence · [One-click Expose] │
│                                                          │
│  ○ postgres_db      postgres:15     —                    │
│    No HTTP port · Skipped                                │
└─────────────────────────────────────────────────────────┘
```

"One-click Expose" for high-confidence label containers bypasses the wizard entirely — route created immediately, cert provisioning starts. User can edit after.

"Review & Expose" for heuristic/medium-confidence containers opens the expose wizard pre-filled with the scanner's suggestions.

---

---

# Monorepo Changes

## Updated structure

```
proxyos/
├── apps/
│   ├── web/                          # Central dashboard (existing)
│   └── agent/                        # NEW: proxyos-agent binary
│       ├── src/
│       │   ├── index.ts
│       │   ├── ws-client.ts
│       │   ├── caddy-sync.ts
│       │   ├── metrics.ts
│       │   ├── health.ts
│       │   └── log-streamer.ts
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   ├── db/                           # existing: Drizzle schema
│   ├── api/                          # existing: tRPC router
│   ├── caddy/                        # existing: Caddy Admin API client
│   ├── sso/                          # existing: SSO provider integrations
│   ├── analytics/                    # existing: log parser + time-series
│   ├── types/                        # existing
│   │
│   ├── federation/                   # NEW: WS protocol types + constants
│   │   ├── messages.ts
│   │   └── constants.ts
│   │
│   ├── importers/                    # NEW: reverse proxy importers
│   │   ├── types.ts                  # ImportedRoute, ImportSourceType
│   │   ├── nginx/
│   │   │   └── parser.ts
│   │   ├── npm/
│   │   │   └── db-reader.ts
│   │   ├── traefik/
│   │   │   ├── api-reader.ts
│   │   │   ├── config-parser.ts
│   │   │   └── label-scanner.ts
│   │   ├── caddy/
│   │   │   └── api-reader.ts
│   │   ├── apache/
│   │   │   └── parser.ts
│   │   ├── haproxy/
│   │   │   └── parser.ts
│   │   └── index.ts                  # unified importer entry point
│   │
│   └── scanner/                      # NEW: Docker/Podman scanner
│       ├── docker/
│       │   ├── scanner.ts
│       │   ├── label-parser.ts
│       │   ├── upstream-resolver.ts
│       │   └── compose-parser.ts
│       └── index.ts
│
├── docker-compose.yml                # existing (Central)
├── docker-compose.agent.yml          # NEW: Agent deployment template
└── .env.example
```

---

# Database Schema Additions

```sql
-- Federation: agent registry
CREATE TABLE agents (
  id          TEXT PRIMARY KEY,           -- ag_01jt...
  name        TEXT NOT NULL,
  site_tag    TEXT,
  description TEXT,
  token_hash  TEXT NOT NULL,             -- SHA256 of JWT, for revocation check
  token_expires_at INTEGER NOT NULL,
  status      TEXT DEFAULT 'offline',    -- online | offline | error
  last_seen   INTEGER,
  caddy_version TEXT,
  route_count INTEGER DEFAULT 0,
  cert_count  INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- Federation: revoked tokens
CREATE TABLE revoked_agent_tokens (
  token_hash  TEXT PRIMARY KEY,
  revoked_at  INTEGER NOT NULL,
  reason      TEXT
);

-- Federation: agent metrics (time-series, per agent per route)
CREATE TABLE agent_metrics (
  agent_id    TEXT NOT NULL,
  route_id    TEXT NOT NULL,
  bucket      INTEGER NOT NULL,          -- unix timestamp, truncated to minute
  req_count   INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  p95_ms      INTEGER,
  bytes_in    INTEGER DEFAULT 0,
  bytes_out   INTEGER DEFAULT 0,
  PRIMARY KEY (agent_id, route_id, bucket)
);

-- Routes: add agent_id column
ALTER TABLE routes ADD COLUMN agent_id TEXT REFERENCES agents(id);

-- Import sessions: track import history
CREATE TABLE import_sessions (
  id          TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,             -- nginx | npm | traefik | caddy | apache | haproxy
  created_at  INTEGER NOT NULL,
  route_count INTEGER DEFAULT 0,
  imported    INTEGER DEFAULT 0,
  skipped     INTEGER DEFAULT 0,
  failed      INTEGER DEFAULT 0,
  result_json TEXT                       -- full import report as JSON
);

-- Scanner: track known containers
CREATE TABLE scanned_containers (
  id            TEXT PRIMARY KEY,        -- Docker container ID
  agent_id      TEXT,
  name          TEXT NOT NULL,
  image         TEXT NOT NULL,
  last_seen     INTEGER NOT NULL,
  route_id      TEXT REFERENCES routes(id),   -- if exposed
  strategy      TEXT,
  confidence    TEXT
);
```

---

# API Surface Additions

New tRPC routers added to `packages/api/`:

```typescript
// agents router
agents.list()                             // GET all agents
agents.get(id)                            // GET single agent
agents.register(input)                    // POST create agent + generate token
agents.revokeToken(id)                    // POST revoke agent token
agents.delete(id)                         // DELETE agent
agents.getMetrics(id, routeId?, range)    // GET time-series metrics for agent
agents.getLogs(id, routeId, lines)        // GET last N log lines from agent
agents.getHealth(id)                      // GET agent health snapshot

// importers router
importers.preview(source, input)          // POST parse source → ImportedRoute[]
importers.commit(sessionId, routeIds)     // POST create routes from preview
importers.getSession(sessionId)           // GET import session status
importers.listSessions()                  // GET import history

// scanner router
scanner.scan(agentId?)                    // POST trigger scan
scanner.getResults(agentId?)             // GET last scan results
scanner.exposeContainer(containerId)      // POST one-click expose (high-confidence)
scanner.dismissContainer(containerId)     // POST don't suggest again
scanner.setAutoWatch(agentId, mode)       // POST configure auto-watch
```

REST endpoints added for agent WebSocket auth (outside tRPC):

```
POST /api/agents/auth        → validate agent JWT, return session
WS   /api/agents/connect     → WebSocket endpoint for agent connections
```

---

# UI Surface Additions

## New routes in `apps/web/`

| Path | Description |
|---|---|
| `/agents` | Agent list + status overview |
| `/agents/new` | Register new agent wizard |
| `/agents/[id]` | Agent detail: routes, metrics, logs, health |
| `/import` | Import wizard entry point |
| `/import/[sessionId]` | Import session progress + report |
| `/scan` | Docker scanner (Central's own Docker host) |
| `/agents/[id]/scan` | Docker scanner for a remote agent |
| `/settings/export` | Export all routes to various formats |

## Modified routes

| Path | Change |
|---|---|
| `/routes` | Add "Agent" column, agent filter, bulk agent assign |
| `/dashboard` | Add federation health widget (agents online/offline) |
| `/expose` (wizard) | Step 1 adds "Agent" picker before Source |

---

# Build Order

These three features have dependencies between them — build in this order:

```
Phase 1 — Foundation (no UI yet)
  1.1  packages/federation/messages.ts        — WS protocol types
  1.2  packages/importers/types.ts            — ImportedRoute type
  1.3  DB schema additions (migration)

Phase 2 — Import (standalone, no federation needed)
  2.1  packages/importers/nginx/parser.ts
  2.2  packages/importers/npm/db-reader.ts
  2.3  packages/importers/traefik/ (all three files)
  2.4  packages/importers/caddy/api-reader.ts
  2.5  packages/importers/apache/parser.ts
  2.6  packages/importers/haproxy/parser.ts
  2.7  importers tRPC router
  2.8  Import wizard UI (/import)

Phase 3 — Docker Scanner (depends on importers/traefik/label-scanner)
  3.1  packages/scanner/docker/label-parser.ts
  3.2  packages/scanner/docker/upstream-resolver.ts
  3.3  packages/scanner/docker/scanner.ts
  3.4  packages/scanner/docker/compose-parser.ts
  3.5  scanner tRPC router
  3.6  Scanner UI (/scan)

Phase 4 — Federation (depends on all above)
  4.1  Central: apps/web/server/federation/ws-server.ts
  4.2  Central: agent-registry.ts, config-push.ts
  4.3  Central: metrics-collector.ts, log-broker.ts
  4.4  Agent: apps/agent/ (full implementation)
  4.5  Agent docker image + docker-compose.agent.yml
  4.6  Agents tRPC router
  4.7  Agents UI (/agents, /agents/new, /agents/[id])
  4.8  Route table + expose wizard agent picker

Phase 5 — Polish
  5.1  Export feature (/settings/export)
  5.2  Auto-watch mode
  5.3  Import history + re-import from session
  5.4  Agent token rotation UI
  5.5  Cross-site route clone (push same route to N agents)
```

Total estimated complexity: **~3-4 weeks** for a focused single-developer build, starting from V1 MVP complete.

---

*ProxyOS V2 Feature Spec — proxyos.app — Homelab OS family*
