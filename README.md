<div align="center">

<svg width="80" height="80" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="16" fill="#0D0D1A"/>
  <rect x="10" y="10" width="20" height="20" rx="5" fill="#7C6FF0"/>
  <rect x="34" y="10" width="20" height="20" rx="5" fill="#534AB7"/>
  <rect x="10" y="34" width="20" height="20" rx="5" fill="#534AB7"/>
  <rect x="34" y="34" width="20" height="20" rx="5" fill="#9D8FFF"/>
  <rect x="28" y="28" width="8" height="8" rx="2" fill="#F0EFFE"/>
</svg>

# ProxyOS

**Route · Secure · Observe**

The reverse proxy that knows your entire infrastructure — from DNS record to upstream service — managed from one place.

[![License: MIT](https://img.shields.io/badge/License-MIT-7C6FF0.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io%2Fproxyos%2Fproxyos-7C6FF0)](https://github.com/proxyos/proxyos/pkgs/container/proxyos)
[![Part of Homelab OS](https://img.shields.io/badge/Homelab%20OS-family-534AB7)](https://homelabos.app)

</div>

---

## What is ProxyOS?

ProxyOS is a self-hosted reverse proxy manager built on [Caddy](https://caddyserver.com). It wraps Caddy's JSON Admin API with a full dashboard — so instead of editing config files, you expose services, manage TLS, toggle SSO, and observe traffic through a clean UI.

Unlike Nginx Proxy Manager or Traefik, ProxyOS is designed to manage the **entire exposure chain** — not just the proxy layer. Through its Connections system, it can automatically create DNS records in Cloudflare, configure Authentik outposts, add Cloudflare Tunnel ingress rules, and create Uptime Kuma monitors — all from a single "Expose service" action.

### Core capabilities

- **One-button expose** — enter an IP:port, pick a domain, click expose. Route active in Caddy in under 50ms, cert provisioning starts automatically
- **SSO per route** — toggle Authentik or Authelia protection on any route. ProxyOS generates the `forward_auth` Caddy config and auto-configures the provider
- **Built-in analytics** — request rate, error rate, p50/p95 latency per route. SQLite time-series, no external dependencies
- **Certificate management** — Let's Encrypt, ZeroSSL, DNS-01 (Cloudflare), Internal CA. Expiry alerts, CT log monitoring, and auto-renewal
- **Federation** — one Central dashboard managing N remote agents across different hosts, networks, or cloud providers
- **Service chain view** — live visualisation of every component in the chain from DNS to upstream, with health status at each node
- **ProxyOS Connect** — manages Cloudflare DNS, Tunnels, Authentik, Uptime Kuma and more as connected external services
- **Security suite** — GeoIP blocking, JWT validation, mTLS, bot challenge, IP banning, Fail2Ban-style rules per route
- **Billing** — Lemon Squeezy integration for cloud subscriptions and self-hosted licence key activation

---

## Table of Contents

- [Quick start](#quick-start)
- [Tech stack](#tech-stack)
- [How it works](#how-it-works)
- [Single container architecture](#single-container-architecture)
- [Features](#features)
- [Multi-environment deployment](#multi-environment-deployment)
- [Agent deployment](#agent-deployment)
- [Networking considerations](#networking-considerations)
- [Configuration reference](#configuration-reference)
- [First-run setup](#first-run-setup)
- [Upgrading](#upgrading)
- [Development](#development)
- [Part of the Homelab OS family](#part-of-the-homelab-os-family)

---

## Quick start

```bash
git clone https://github.com/dariusvorster/proxyos-app
cd proxyos-app
cp .env.example .env
# Edit .env — set PROXYOS_SECRET and PROXYOS_URL at minimum
docker compose up -d
```

Open `http://localhost:3000` (or your configured domain) and complete the setup wizard.

---

## Tech stack

| Layer | Technology |
|---|---|
| Dashboard | Next.js 15 (App Router) |
| API | tRPC v11 over HTTP |
| Database | BetterSQLite3 + Drizzle ORM |
| Proxy | Caddy v2 (JSON Admin API) |
| Process supervisor | s6-overlay v3 |
| Billing | Lemon Squeezy |
| Runtime | Node.js 22, single Docker container |

No external database required. SQLite runs inside the container, persisted to a Docker volume.

---

## How it works

```
User request
    ↓
[DNS] → resolves your domain to your IP / tunnel
    ↓
[Cloudflare Tunnel or direct] → reaches your host
    ↓
[Caddy — port 80/443] → TLS termination, route matching
    ↓
[SSO check] → optional forward_auth to Authentik/Authelia
    ↓
[Upstream service] → your actual app at IP:port
```

ProxyOS writes all Caddy configuration via the JSON Admin API (`localhost:2019`) — no Caddyfile, no config file editing, no restarts. Route changes take effect in under 50ms with zero downtime.

**SQLite is the source of truth.** All routes, certs, agents, and connections live in SQLite. On every startup ProxyOS rebuilds the full Caddy config from the database.

---

## Single container architecture

ProxyOS and Caddy run in a **single Docker container** managed by [s6-overlay](https://github.com/just-containers/s6-overlay).

```
ghcr.io/proxyos/proxyos:latest
│
└── s6-overlay (PID 1)
    ├── caddy      (starts first — port 80/443 + Admin API localhost:2019)
    └── proxyos    (starts after caddy — Next.js dashboard on port 3000)
```

**Startup sequence:**

```
1. s6-overlay starts as PID 1
2. Caddy starts (Admin API only, no routes yet)
3. ProxyOS polls Admin API — waits up to 60s for Caddy to be healthy
4. ProxyOS rebuilds all routes from SQLite → pushes to Caddy
5. ProxyOS bootstraps the dashboard route (PROXYOS_URL now served via Caddy on 443)
6. Setup wizard available
```

Port 3000 never needs to be exposed — Caddy fronts the dashboard through TLS.

---

## Features

### Routing
- Create, edit, delete routes via the dashboard
- Upstream types: HTTP(S), WebSocket, load-balanced pool
- Per-route TLS mode: auto (ACME), DNS-01, internal CA, or off
- Compression, WebSocket, HTTP/2, HTTP/3 toggles per route
- Rate limiting and IP allowlisting per route
- Custom request/response headers per route
- Route templates — built-in and custom

### SSO
- Forward auth to Authentik or Authelia per route
- Response header passthrough (user identity headers to upstream)
- Trusted IP bypass list
- SSO provider health check and status

### Security (per route)
- **GeoIP blocking** — allow or block by country
- **JWT validation** — verify tokens against any JWKS endpoint
- **mTLS** — require client certificates with custom CA
- **Bot challenge** — CAPTCHA or proof-of-work challenge page
- **Exit node blocking** — drop traffic from Tor/VPN exit nodes
- **Secret header** — shared secret required in a custom header
- **IP banning** — manual + Fail2Ban-style automatic banning on error thresholds

### Certificates
- Let's Encrypt and ZeroSSL via HTTP-01 and DNS-01
- Multi-domain certificate management
- ACME account management with rate limit tracking
- Certificate Transparency log monitoring and alerts
- Auto-renewal with configurable lead time

### Analytics & Observability
- Per-route traffic: requests, bytes, errors, 2xx/3xx/4xx/5xx breakdown
- Latency p50/p95 buckets (15m, 1h, 24h, 7d, 30d)
- SLO configuration per route with compliance tracking
- Anomaly baseline detection (hour-of-week model)
- Access log viewer — searchable, filterable, exportable
- System logs — level/category filter, CSV export, auto-clear

### Connections (ProxyOS Connect)
- **Cloudflare** — DNS records and Tunnel ingress auto-created on route expose
- **Authentik** — auto-configure outpost on SSO enable
- **Uptime Kuma** — create monitor on route expose
- Webhook delivery log per connection
- Connection health and last-sync status

### Federation (Agents)
- Register remote Caddy agents from the dashboard
- Persistent WebSocket connection — config diffs pushed in real time
- Per-agent metrics aggregation
- Agent token management — issue, rotate, revoke
- Container scanner — detect running containers and suggest routes
- Docker Compose watcher — auto-apply label changes to routes

### Automation & Intelligence
- Chain view — end-to-end health from DNS → tunnel → Caddy → upstream
- Import routes from existing Nginx / Traefik / Caddy configs
- Route templates with one-click apply
- Approval workflow — require admin sign-off on route changes
- Compose watcher — watch project path and auto-update routes from Docker labels

### Billing
- **Cloud** — Lemon Squeezy checkout for Solo ($9/mo) and Teams ($29/mo)
- **Self-hosted** — licence key activation via Lemon Squeezy Licence API
- Webhook handler with HMAC-SHA256 signature verification and idempotency
- Subscription status, 14-day trial, dunning state machine
- Customer portal link — manage payment method, cancel, switch plan
- Billing history table

### User management
- Local email/password auth with auth guard (all pages protected)
- Profile with avatar upload (Canvas resize to 128×128 JPEG)
- Role-based access: admin, operator, viewer
- API key management with scope control
- Pending changes + approval workflow

---

## Multi-environment deployment

### Pattern 1 — Single instance

```yaml
services:
  proxyos:
    image: ghcr.io/proxyos/proxyos:latest
    container_name: proxyos
    restart: unless-stopped
    network_mode: host
    volumes:
      - proxyos_data:/data
    environment:
      - PROXYOS_SECRET=your-secret-here
      - PROXYOS_URL=https://proxy.yourdomain.com

volumes:
  proxyos_data:
```

`network_mode: host` is recommended — Caddy reaches upstreams at local IPs without bridge networking overhead.

### Pattern 2 — Central + remote agents

One Central dashboard + N lightweight agents on remote hosts.

```
Central (proxy.yourdomain.com)
├── Agent: homelab-primary  (same LAN)
├── Agent: homelab-secondary (different VLAN)
├── Agent: vps-racknerd     (WireGuard tunnel)
└── Agent: hetzner-prod     (Tailscale)
```

Add `- "7890:7890"` to Central's ports for the agent WebSocket. Set `PROXYOS_AGENT_PORT=7890`.

### Pattern 3 — ProxyOS Cloud

Multi-tenant Central on a cloud server. Customers run only the agent image.

```
app.proxyos.app (multi-tenant Central)
└── Customers run proxyos-agent with CENTRAL_URL + AGENT_TOKEN
```

This is the `$9/mo Solo` and `$29/mo Teams` tier.

---

## Agent deployment

Register from the dashboard under **Agents → Register agent**, then:

```bash
docker run -d \
  --name proxyos-agent \
  --restart unless-stopped \
  --network host \
  -v proxyos_agent_data:/data \
  -e CENTRAL_URL=https://proxy.yourdomain.com \
  -e AGENT_TOKEN=eyJhbGc... \
  -e AGENT_ID=ag_01jt... \
  ghcr.io/proxyos/proxyos-agent:latest
```

On reconnect after a disconnect, Caddy keeps running with the last applied config — zero service disruption. Agent reconnects with exponential backoff (1s → 2s → 4s → max 60s).

---

## Networking considerations

**Recommended:** `network_mode: host` — Caddy reaches upstream services by local IP directly.

**Bridge networking** — expose ports 80, 443, 443/udp, 7890. Upstreams on the host reachable at `172.17.0.1`.

**Cloudflare Tunnel** — if behind NAT, run `cloudflared` and point ingress at `localhost:443`. ProxyOS Connect manages tunnel ingress rules automatically.

---

## Configuration reference

### Required

| Variable | Description |
|---|---|
| `PROXYOS_SECRET` | Master secret for credential encryption and JWT signing. Min 32 chars. |
| `PROXYOS_URL` | Full URL where the dashboard is served, e.g. `https://proxy.yourdomain.com` |

### Optional — instance

| Variable | Default | Description |
|---|---|---|
| `PROXYOS_AGENT_PORT` | `7890` | WebSocket port for agent connections |
| `CADDY_ADMIN` | `localhost:2019` | Caddy Admin API address |
| `PROXYOS_DB_PATH` | `/data/proxyos.db` | SQLite database path |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

### Optional — billing

| Variable | Description |
|---|---|
| `LEMONSQUEEZY_API_KEY` | Lemon Squeezy API key |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Webhook HMAC secret |
| `LEMONSQUEEZY_STORE_ID` | LS store ID |
| `PROXYOS_SOLO_MONTHLY_VARIANT_ID` | LS variant — Solo monthly |
| `PROXYOS_SOLO_ANNUAL_VARIANT_ID` | LS variant — Solo annual |
| `PROXYOS_TEAMS_MONTHLY_VARIANT_ID` | LS variant — Teams monthly |
| `PROXYOS_TEAMS_ANNUAL_VARIANT_ID` | LS variant — Teams annual |
| `PROXYOS_SH_PRO_MONTHLY_VARIANT_ID` | LS variant — Self-hosted Pro monthly |
| `PROXYOS_SH_TEAMS_MONTHLY_VARIANT_ID` | LS variant — Self-hosted Teams monthly |
| `BILLING_SUCCESS_URL` | Redirect after successful checkout |
| `TRIAL_DAYS` | `14` | Free trial length |

### Optional — TLS

| Variable | Default | Description |
|---|---|---|
| `ACME_EMAIL` | — | Email for Let's Encrypt / ZeroSSL |
| `ACME_CA` | `https://acme-v02.api.letsencrypt.org/directory` | ACME directory URL |
| `CLOUDFLARE_API_TOKEN` | — | For DNS-01 challenges |

### Optional — agent only

| Variable | Description |
|---|---|
| `CENTRAL_URL` | URL of the Central instance |
| `AGENT_TOKEN` | JWT token from Central |
| `AGENT_ID` | Agent ID from Central |

---

## First-run setup

On first start with an empty database:

1. **Admin account** — set your email and password
2. **Confirm URL** — verify `PROXYOS_URL`; DNS must point here before completing
3. **Connect Cloudflare** *(optional)* — API token for automatic DNS record creation
4. **Done** — cert provisioning shown inline (~60s for HTTP-01, ~2min for DNS-01)

---

## Upgrading

Schema migrations run automatically on startup. No manual steps.

```bash
docker compose pull
docker compose up -d
```

Manual backup:

```bash
docker exec proxyos sqlite3 /data/proxyos.db ".backup /data/proxyos.db.bak"
```

---

## Development

```bash
pnpm install
pnpm dev          # Next.js on :3000
```

Caddy must be running locally with the Admin API on `:2019`:

```bash
caddy run --config /dev/null --adapter ''
```

**Monorepo layout:**

```
apps/web              Next.js 15 dashboard + tRPC HTTP handler
packages/api          tRPC router (all features)
packages/billing      Lemon Squeezy utilities (checkout, webhook, licence)
packages/db           Drizzle schema + SQLite client + migrations
packages/caddy        Typed Caddy Admin API client + route builder
packages/types        Shared TypeScript types
packages/analytics    Traffic metrics + access log
packages/alerts       Alert rules + alert events
packages/sso          SSO provider integration
packages/connect      External connections (Cloudflare, Authentik, etc.)
packages/federation   Agent WebSocket protocol
packages/scanner      Container scanner
packages/importers    Config import (Nginx/Traefik/Caddy)
```

---

## Part of the Homelab OS family

ProxyOS is one product in the [Homelab OS](https://homelabos.app) family — infrastructure tools sharing a common design system and integrating at the API level.

| Product | Description |
|---|---|
| [MxWatch](https://mxwatch.app) | Email infrastructure monitoring |
| **ProxyOS** | Reverse proxy management |
| BackupOS | Unified backup management |
| InfraOS | Infrastructure control plane |
| LockBoxOS | Credential vault |
| PatchOS | Patch management |
| AccessOS | Directory & identity |

ProxyOS integrates with InfraOS (`ios expose` creates routes), BackupOS (scheduled SQLite snapshots), LockBoxOS (runtime secret fetch), PatchOS (fleet version management + auto-rollback), and MxWatch (mail route detection).

---

## License

MIT — see [LICENSE](LICENSE).

ProxyOS is free and open source. The managed cloud tier ([proxyos.app](https://proxyos.app)) is a commercial service built on the same codebase.

---

<div align="center">
<sub>Built by <a href="https://homelabos.app">Homelab OS</a> · <a href="https://proxyos.app">proxyos.app</a></sub>
</div>
