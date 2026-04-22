# Installation

ProxyOS runs as a single Docker container. The container includes Caddy (the actual reverse proxy) and the management dashboard (Next.js), supervised by s6-overlay.

---

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- Ports 80, 443, and your chosen dashboard port available on the host
- The host's Docker socket (`/var/run/docker.sock`) — ProxyOS mounts it read-only for network discovery
- A domain name (or local DNS) pointing at the host, for any routes you want to expose over TLS

---

## Quick start

### 1. Create a working directory

```bash
mkdir proxyos && cd proxyos
```

### 2. Create `docker-compose.yml`

```yaml
services:
  proxyos:
    image: ghcr.io/proxyos/proxyos:1.0.0
    container_name: proxyos
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "${PROXYOS_DASHBOARD_PORT:-3091}:3000"   # dashboard
      - "${PROXYOS_HTTP_PORT:-80}:80"             # Caddy HTTP
      - "${PROXYOS_HTTPS_PORT:-443}:443"          # Caddy HTTPS
      - "${PROXYOS_HTTPS_PORT:-443}:443/udp"      # HTTP/3 QUIC
    dns:
      - 8.8.8.8
      - 1.1.1.1
    environment:
      NODE_ENV: production
      PORT: 3000
      PROXYOS_SECRET: ${PROXYOS_SECRET:?set PROXYOS_SECRET in .env}
      PROXYOS_URL: ${PROXYOS_URL:-}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    volumes:
      - proxyos-data:/data/proxyos
      - caddy-data:/data/caddy
      - caddy-config:/config/caddy
      - /var/run/docker.sock:/var/run/docker.sock:ro

volumes:
  proxyos-data:
  caddy-data:
  caddy-config:
```

> **Note:** The `PROXYOS_DASHBOARD_PORT` defaults to `3000` in the compose file itself but is commonly set to `3091` in `.env` to avoid conflicts. Set whatever port suits your setup.

> **Upgrade path:** To upgrade, change the image tag (e.g. `1.0.0` → `1.1.0`), pull the new image
> (`docker compose pull`), and recreate the container (`docker compose up -d`). Check the
> [ProxyOS changelog](https://github.com/proxyos/proxyos/releases) before upgrading.

### 3. Create `.env`

```bash
# Required
PROXYOS_SECRET=change-me-to-a-long-random-string

# Optional — public URL of the dashboard (used for OAuth callbacks, email links)
PROXYOS_URL=https://proxyos.yourdomain.com

# Port overrides (defaults shown)
PROXYOS_DASHBOARD_PORT=3091
PROXYOS_HTTP_PORT=80
PROXYOS_HTTPS_PORT=443

# Log verbosity: error | warn | info | debug
LOG_LEVEL=info
```

Generate a secure secret:

```bash
openssl rand -hex 32
```

**Never commit `.env` to version control.**

### 4. Start the container

```bash
docker compose up -d
```

### 5. Check it started

```bash
docker compose ps
docker compose logs -f proxyos
```

The health check polls `http://localhost:3000/api/health`. Once you see `healthy` in `docker ps`, the dashboard is ready.

### 6. Open the dashboard

Navigate to `http://your-host:3091` (or whatever port you set for `PROXYOS_DASHBOARD_PORT`).

On first boot you will be prompted to create an admin account.

---

## Data persistence

Three named volumes are created automatically:

| Volume | Mount path | Contents |
|---|---|---|
| `proxyos-data` | `/data/proxyos` | SQLite database (`proxyos.db`), access log |
| `caddy-data` | `/data/caddy` | Caddy certificates, ACME accounts |
| `caddy-config` | `/config/caddy` | Caddy runtime config |

The Caddy base config (`/etc/caddy/base-config.json`) is baked into the image and is **not** stored in a volume. It is always the version that shipped with the image.

---

## Upgrading

Pull the new image and recreate the container. The database is migrated automatically on startup.

```bash
docker compose pull
docker compose up -d
```

See [Upgrades](../admin/upgrades.md) for details.

---

## Building from source

```bash
git clone https://github.com/your-org/proxyos
cd proxyos
docker build -t proxyos:local .
```

The build uses a multi-stage Dockerfile:
1. `builder` — compiles the Next.js app
2. `caddy-builder` — builds Caddy with the `caddy-l4`, `caddy-dns/cloudflare`, and `coraza-caddy` plugins using xcaddy
3. `runner` — assembles the final Alpine image with s6-overlay
