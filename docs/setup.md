# Setup

## Prerequisites

- Docker 24+ (or Docker Engine with Compose plugin)
- A domain with DNS records pointing to your server
- Ports 80 and 443 open and reachable from the internet (required for ACME HTTP-01 certificate issuance)
- Port 3000 accessible from your browser (can be firewalled; only you need it)

---

## Docker Compose

```yaml
services:
  proxyos:
    image: ghcr.io/proxyos/proxyos:1.0.0
    container_name: proxyos
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "3000:3000"
      - "7890:7890"        # federation WebSocket; omit if not using federation
    volumes:
      - /data/proxyos:/data/proxyos       # database and access logs
      - /data/caddy:/data/caddy           # Caddy TLS state (certificates)
      - /config/caddy:/config/caddy       # Caddy config persistence
      - /var/run/docker.sock:/var/run/docker.sock  # Docker scanner
    environment:
      PROXYOS_SECRET: "your-32-plus-character-random-secret-here"
      PROXYOS_MODE: standalone
      # Optional — override defaults only if needed:
      # PROXYOS_DB_PATH: /data/proxyos/proxyos.db
      # PROXYOS_ACCESS_LOG: /data/proxyos/access.log
      # CADDY_ADMIN_URL: http://localhost:2019
      # CLOUDFLARE_API_TOKEN: ""
```

---

## First Run

### 1. Generate a secret

`PROXYOS_SECRET` must be at least 32 characters. Generate one:

```bash
openssl rand -hex 32
```

Set the output as the value of `PROXYOS_SECRET` in your compose file.

### 2. Create data directories

```bash
mkdir -p /data/proxyos /data/caddy /config/caddy
```

### 3. Start the container

```bash
docker compose up -d
```

### 4. Open the UI

Navigate to `http://your-server:3000` in your browser. On first load you will be prompted to create an admin account.

### 5. Verify Caddy is running

The UI header shows a green Caddy status indicator when the Admin API at `localhost:2019` is reachable. If it shows red, check container logs:

```bash
docker compose logs -f proxyos
```

---

## Cloudflare DNS-01 (optional)

DNS-01 lets Caddy issue certificates without port 80 being reachable — useful for internal services or servers behind NAT.

1. Create a Cloudflare API token with `Zone:DNS:Edit` permission scoped to your domain.
2. Add to your compose file:

```yaml
environment:
  CLOUDFLARE_API_TOKEN: "your-cloudflare-api-token"
```

3. When creating a route, select **TLS mode: DNS-01** instead of Auto.

---

## Upgrading

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup. No manual schema changes are needed between versions.

> **Upgrade path:** To upgrade, change the image tag (e.g. `1.0.0` → `1.1.0`), pull the new image
> (`docker compose pull`), and recreate the container (`docker compose up -d`). Check the
> [ProxyOS changelog](https://github.com/proxyos/proxyos/releases) before upgrading.

---

## Standalone vs Federation modes

| Mode | `PROXYOS_MODE` value | Description |
|---|---|---|
| Standalone | `standalone` | Single instance, manages its own Caddy |
| Central | `central` | Manages remote nodes; no local Caddy traffic |
| Node | `node` | Receives config from central; runs Caddy locally |
| Central + Node | `central+node` | Acts as both; manages nodes and runs local Caddy |

For multi-node federation setup see [federation](how-to/federation.md).
