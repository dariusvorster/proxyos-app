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
[![Version](https://img.shields.io/badge/version-v3.1-7C6FF0)](https://github.com/proxyos/proxyos/releases)
[![Part of Homelab OS](https://img.shields.io/badge/Homelab%20OS-family-534AB7)](https://homelabos.app)

</div>

---

## What is ProxyOS?

ProxyOS is a self-hosted reverse proxy manager built on [Caddy](https://caddyserver.com). It wraps Caddy's JSON Admin API with a full dashboard — so instead of editing config files, you expose services, manage TLS, toggle SSO, and observe traffic through a clean UI.

Unlike Nginx Proxy Manager or Traefik, ProxyOS is designed to manage the **entire exposure chain** — not just the proxy layer. Through its Connections system (V3), it can automatically create DNS records in Cloudflare, configure Authentik outposts, add Cloudflare Tunnel ingress rules, and create Uptime Kuma monitors — all from a single "Expose service" action.

### Core capabilities

- **One-button expose** — enter an IP:port, pick a domain, click expose. Route active in Caddy in under 50ms, cert provisioning starts automatically
- **SSO per route** — toggle Authentik or Authelia protection on any route. ProxyOS generates the `forward_auth` Caddy config and (V3) auto-configures the provider
- **Built-in analytics** — request rate, error rate, p50/p95 latency per route. SQLite time-series, no external dependencies
- **Certificate management** — Let's Encrypt, ZeroSSL, DNS-01 (Cloudflare), Internal CA. Expiry alerts and auto-renewal
- **Federation** — one Central dashboard managing N remote agents across different hosts, networks, or cloud providers
- **Service chain view** (V3) — live visualisation of every component in the chain from DNS to upstream, with health status at each node
- **ProxyOS Connect** (V3) — manages Cloudflare DNS, Tunnels, WAF, Authentik, Uptime Kuma and more as connected external services

---

## Table of Contents

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Single container architecture](#single-container-architecture)
- [Multi-environment deployment](#multi-environment-deployment)
  - [Pattern 1 — Single instance](#pattern-1--single-instance)
  - [Pattern 2 — Central + remote agents](#pattern-2--central--remote-agents)
  - [Pattern 3 — ProxyOS Cloud](#pattern-3--proxyos-cloud)
- [Agent deployment](#agent-deployment)
- [Networking considerations](#networking-considerations)
- [Configuration reference](#configuration-reference)
- [First-run setup](#first-run-setup)
- [Upgrading](#upgrading)
- [Part of the Homelab OS family](#part-of-the-homelab-os-family)

---

## Quick start

```bash
git clone https://github.com/proxyos/proxyos
cd proxyos
cp .env.example .env
# Edit .env — set PROXYOS_SECRET and PROXYOS_URL at minimum
docker compose up -d
```

Open `http://localhost:3000` (or your configured domain) and complete the setup wizard. Done.

---

## How it works

ProxyOS sits between your users and your upstream services. Every exposed service goes through this chain:

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

ProxyOS manages all of this. Caddy runs inside the same container as ProxyOS. ProxyOS writes all Caddy configuration via the Caddy JSON Admin API (`localhost:2019`) — no Caddyfile, no config file editing, no restarts. Route changes take effect in under 50ms with zero downtime.

**SQLite is the source of truth.** ProxyOS stores all routes, certs, agents, and connections in SQLite. On every startup, ProxyOS rebuilds the complete Caddy configuration from the database. If Caddy ever restarts independently, ProxyOS detects it and immediately reloads all routes.

---

## Single container architecture

ProxyOS and Caddy run in a **single Docker container** using [s6-overlay](https://github.com/just-containers/s6-overlay) as the process supervisor. There is no separate Caddy container. This is by design — it keeps deployment simple, eliminates inter-container networking issues, and ensures Caddy and ProxyOS always start and stop together.

```
ghcr.io/proxyos/proxyos:latest
│
└── s6-overlay (PID 1 — supervises both processes)
    ├── caddy         (starts first — listens on 80/443, Admin API on localhost:2019)
    └── proxyos       (starts after caddy — Next.js API + dashboard on port 3000)
```

**Startup sequence:**

```
1. s6-overlay starts as PID 1
2. Caddy starts with minimal base config (Admin API only, no routes)
3. ProxyOS starts (s6 dependency: waits for Caddy to be healthy)
4. ProxyOS calls caddy.reload → rebuilds all routes from SQLite
5. ProxyOS bootstraps the dashboard route into Caddy
   (your PROXYOS_URL domain now serves the dashboard via Caddy on port 443)
6. Setup wizard available at your domain
```

Port 3000 (ProxyOS internal) never needs to be exposed externally. Caddy fronts the dashboard through the same TLS-terminated path as all other routes.

---

## Multi-environment deployment

ProxyOS supports three deployment patterns depending on your infrastructure size.

---

### Pattern 1 — Single instance

The simplest deployment. One container, one host, manages all routes on that host.

```
Internet
    ↓
Your server (single Docker host)
    └── proxyos container
        ├── Caddy (serves all routes)
        └── ProxyOS (dashboard + API)
```

**Use this when:** you have one server or VM, all your services are on the same host or reachable over the same network.

**`docker-compose.yml`:**

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

`network_mode: host` is recommended for homelab use — Caddy can reach upstream services on the local network directly by IP without Docker bridge networking complications.

---

### Pattern 2 — Central + remote agents

The federation model. One **Central** instance is the authoritative dashboard and database. N **Agent** instances run on remote hosts (different VLANs, different sites, VPS nodes, cloud servers). Each agent runs a lightweight Caddy + agent sidecar — no dashboard, no Next.js.

```
Central (proxy.yourdomain.com)
│   Full ProxyOS: dashboard + API + Caddy + SQLite
│   The only place you manage anything
│
├── Agent: homelab-primary (192.168.69.x)   ← same LAN
├── Agent: homelab-secondary (192.168.80.x) ← different VLAN
├── Agent: vps-racknerd (10.7.0.2)          ← WireGuard tunnel
├── Agent: hetzner-prod (Tailscale)         ← remote cloud
└── Agent: client-site (Cloudflare Tunnel)  ← outbound-only
```

**How it works:**

1. Central holds the SQLite database — all routes, all agents, all config
2. Each agent connects to Central over a persistent WebSocket connection
3. When you create or change a route in the Central dashboard, Central pushes the config diff to the relevant agent over WebSocket
4. The agent applies the change to its local Caddy instance via the Admin API
5. The agent streams metrics and logs back to Central every 30 seconds
6. If an agent loses its connection to Central, **Caddy keeps running with the last known config** — no service disruption

**Agent connectivity options:**

| Method | Use case | Notes |
|---|---|---|
| Direct TLS | Same LAN or site-to-site VPN | Fastest, lowest overhead |
| Tailscale | Cross-network homelab nodes | Simplest for multi-site |
| WireGuard | VPS or remote sites | Requires existing WireGuard setup |
| Cloudflare Tunnel | Outbound-only agents | Agent connects out, no inbound port needed |

**Central `docker-compose.yml`** (same as Pattern 1 — the full image):

```yaml
services:
  proxyos:
    image: ghcr.io/proxyos/proxyos:latest
    container_name: proxyos
    restart: unless-stopped
    network_mode: host
    ports:
      - "7890:7890"   # agent WebSocket port — must be reachable by agents
    volumes:
      - proxyos_data:/data
    environment:
      - PROXYOS_SECRET=your-secret-here
      - PROXYOS_URL=https://proxy.yourdomain.com
      - PROXYOS_AGENT_PORT=7890

volumes:
  proxyos_data:
```

Port `7890` is the dedicated WebSocket port for agent connections. It must be reachable from all agent hosts. If agents connect via WireGuard or Tailscale, this port only needs to be open within the tunnel — not on the public internet.

---

### Pattern 3 — ProxyOS Cloud

Managed SaaS. Central runs on a cloud server (Hetzner CX22 recommended — same as the MxWatch pattern). Customers run only the agent image on their own infrastructure. Central is multi-tenant.

```
Hetzner CX22 (app.proxyos.app)
│   Multi-tenant Central
│   Each customer = isolated org in the DB
│
Customer A homelab
│   proxyos-agent image
│   CENTRAL_URL=https://app.proxyos.app
│   AGENT_TOKEN=<customer-a-token>
│
Customer B VPS
    proxyos-agent image
    CENTRAL_URL=https://app.proxyos.app
    AGENT_TOKEN=<customer-b-token>
```

This pattern is the `$9/mo Solo` and `$29/mo Teams` tier. Customers never run a Central — they only run agents. The Central dashboard at `app.proxyos.app` is their interface.

---

## Agent deployment

Agents are registered from the Central dashboard under **Agents → Register agent**. Central generates a signed JWT token tied to your Central instance.

**Install a new agent on any host:**

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

Or with Docker Compose:

```yaml
services:
  proxyos-agent:
    image: ghcr.io/proxyos/proxyos-agent:latest
    container_name: proxyos-agent
    restart: unless-stopped
    network_mode: host
    volumes:
      - agent_data:/data
    environment:
      - CENTRAL_URL=https://proxy.yourdomain.com
      - AGENT_TOKEN=eyJhbGc...
      - AGENT_ID=ag_01jt...

volumes:
  agent_data:
```

**What happens after `docker run`:**

```
1. Agent starts Caddy with empty config (Admin API only)
2. Agent connects to Central WebSocket at CENTRAL_URL:7890
3. Central authenticates the token
4. Central sends the full route config for this agent
5. Agent applies config to Caddy
6. Agent sends READY acknowledgement
7. Central marks agent as "online"
8. Agent enters steady state: receives diffs, streams metrics
```

The agent is now fully managed from Central. No further configuration needed on the agent host.

**Agent reconnection behaviour:**

If the agent loses its connection to Central (network drop, Central restart, etc.):

- Caddy **keeps running** with the last applied configuration — zero service disruption
- Agent enters reconnect loop with exponential backoff (1s → 2s → 4s → max 60s)
- On reconnect, Central sends a config diff since the agent's last sync timestamp
- If the diff is ambiguous, the agent requests a full resync

**Agent token security:**

- Tokens are signed JWTs with a 1-year expiry
- The token embeds a `central_fingerprint` (SHA256 of Central's TLS certificate) — prevents a stolen token being used against a different Central instance
- Revoke tokens from Central: **Agents → [agent name] → Revoke token**
- After revocation, the agent is refused on next reconnect attempt

---

## Networking considerations

### Host networking vs bridge networking

**Recommended: `network_mode: host`**

With host networking, Caddy can reach upstream services at their local IPs directly (e.g. `192.168.69.25:5678`). This is what you want for homelab use.

**Bridge networking:**

If you cannot use host networking (some cloud providers, Docker Desktop on Mac):

```yaml
services:
  proxyos:
    image: ghcr.io/proxyos/proxyos:latest
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"   # HTTP/3 QUIC
      - "3000:3000"     # dashboard (optional, Caddy fronts it)
      - "7890:7890"     # agent WebSocket
    networks:
      - proxynet

networks:
  proxynet:
    driver: bridge
```

With bridge networking, upstreams that are on the host (not in Docker) must be reached via the Docker host gateway IP, typically `172.17.0.1`. ProxyOS and the scanner will warn you when a configured upstream is unreachable and suggest the correct address.

### Cloudflare Tunnel pattern

If your server is behind NAT with no inbound ports (typical homelab), the recommended pattern is Cloudflare Tunnel:

```
Internet → Cloudflare edge → cloudflared → ProxyOS/Caddy
```

ProxyOS V3 (Connect) manages the Cloudflare Tunnel ingress rules automatically when a route is created. Without V3, run `cloudflared` in a separate container and point its ingress rules at `localhost:443` or your ProxyOS container.

For the classic WireGuard relay pattern (RackNerd VPS → homelab):

```
Internet → VPS (23.95.x.x) → iptables DNAT → WireGuard → Caddy (10.7.0.2)
```

The WireGuard endpoint forwards ports 80/443 to ProxyOS over the tunnel. ProxyOS serves everything. No changes to ProxyOS configuration needed for this pattern — it's transparent at the network layer.

---

## Configuration reference

All configuration is via environment variables. Set these in `.env` or your `docker-compose.yml`.

### Required

| Variable | Description |
|---|---|
| `PROXYOS_SECRET` | Master secret — used to encrypt stored credentials (Cloudflare tokens, etc.) and sign internal JWTs. Min 32 chars. **Change this before first run.** |
| `PROXYOS_URL` | The full URL where the ProxyOS dashboard will be served (e.g. `https://proxy.yourdomain.com`). Used by Caddy to bootstrap the dashboard route and request its TLS certificate. |

### Optional — instance

| Variable | Default | Description |
|---|---|---|
| `PROXYOS_AGENT_PORT` | `7890` | WebSocket port for agent connections |
| `CADDY_ADMIN` | `localhost:2019` | Caddy Admin API address. Do not expose this publicly. |
| `DATABASE_PATH` | `/data/proxyos.db` | SQLite database path |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `CADDY_LOG_PATH` | `/data/logs/caddy.log` | Caddy access log path (JSON structured) |

### Optional — agent only

| Variable | Description |
|---|---|
| `CENTRAL_URL` | URL of the Central instance this agent connects to |
| `AGENT_TOKEN` | JWT token issued by Central during agent registration |
| `AGENT_ID` | Agent ID assigned by Central during registration |

### Optional — TLS / ACME

| Variable | Default | Description |
|---|---|---|
| `ACME_EMAIL` | — | Email for Let's Encrypt / ZeroSSL account registration |
| `ACME_CA` | `https://acme-v02.api.letsencrypt.org/directory` | ACME directory URL |
| `CLOUDFLARE_API_TOKEN` | — | Cloudflare API token for DNS-01 challenges (required for private/wildcard domains) |

---

## First-run setup

On first start with an empty database, ProxyOS runs a setup wizard:

**Step 1 — Admin account**
Set your admin email and password.

**Step 2 — Confirm URL**
Verify the ProxyOS URL (pre-filled from `PROXYOS_URL`). ProxyOS will request a TLS certificate for this domain from Let's Encrypt. Make sure your DNS points to this server before completing this step.

**Step 3 — Connect Cloudflare** *(optional but recommended)*
Provide a Cloudflare API token. ProxyOS will automatically create DNS records when you expose services. Skip this if you manage DNS manually.

**Step 4 — Done**
Dashboard is live. Certificate provisioning shown inline — typically completes in under 60 seconds for public domains using HTTP-01, under 2 minutes for DNS-01.

---

## Upgrading

ProxyOS follows semantic versioning. The SQLite database schema is migrated automatically on startup using Drizzle migrations — no manual steps needed.

```bash
# Pull the latest image
docker compose pull

# Restart with the new image
docker compose up -d
```

**Before upgrading**, BackupOS (if configured) automatically snapshots the SQLite database. If ProxyOS fails its health check after upgrade, PatchOS triggers an automatic rollback to the previous image.

To manually backup before upgrading:

```bash
docker exec proxyos sqlite3 /data/proxyos.db ".backup /data/proxyos.db.bak"
```

---

## Part of the Homelab OS family

ProxyOS is one product in the [Homelab OS](https://homelabos.app) family — a suite of self-hosted infrastructure tools that share a common design system and integrate with each other.

| Product | Description | Accent |
|---|---|---|
| [MxWatch](https://mxwatch.app) | Email infrastructure monitoring | Blue |
| **ProxyOS** | Reverse proxy management | Purple |
| [BackupOS](https://backupos.app) | Unified backup management | Amber |
| [InfraOS](https://infraos.app) | Infrastructure control plane | Green |
| LockBoxOS | Credential vault | Purple |
| PatchOS | Patch management | Red |
| AccessOS | Directory & identity | Teal |

All products share the same design system (Inter + IBM Plex Mono, identical surface tokens, consistent component library) and integrate with each other at the API level. ProxyOS integrates with:

- **InfraOS** — `ios expose` command creates ProxyOS routes; topology view shows route chain health
- **BackupOS** — automatic SQLite DB backup on schedule; pre-upgrade snapshots
- **MxWatch** — detects mail-related routes and flags them for deliverability monitoring
- **LockBoxOS** — stores API tokens and mTLS certs in the vault; ProxyOS fetches at runtime
- **PatchOS** — manages ProxyOS agent version across fleet; auto-rollback on failed updates

---

## License

MIT — see [LICENSE](LICENSE).

ProxyOS is free and open source. The managed cloud tier ([proxyos.app](https://proxyos.app)) is a commercial service built on the same open source codebase.

---

<div align="center">
<sub>Built by <a href="https://homelabos.app">Homelab OS</a> · <a href="https://proxyos.app">proxyos.app</a></sub>
</div>
