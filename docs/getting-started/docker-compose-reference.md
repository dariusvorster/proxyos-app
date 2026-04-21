# Docker Compose Reference

All configuration is passed to ProxyOS via environment variables. The recommended approach is an `.env` file loaded by `env_file:` in `docker-compose.yml`.

---

## Required variables

### `PROXYOS_SECRET`

**Required. No default.**

A secret string used to sign session tokens and cookies. Must be set before first boot. If you change this value, all existing sessions are invalidated — every logged-in user will be logged out.

```bash
# Generate a secure value
openssl rand -hex 32
```

Set as:

```env
PROXYOS_SECRET=your-64-char-hex-string-here
```

---

## Optional variables

### `PROXYOS_URL`

The public URL at which the dashboard is reachable. Used for OAuth callback URLs, email verification links, and any absolute URL that ProxyOS generates.

```env
PROXYOS_URL=https://proxyos.yourdomain.com
```

If not set, ProxyOS derives URLs from the incoming request host.

---

### `LOG_LEVEL`

Controls the verbosity of application logs written to stdout.

| Value | Description |
|---|---|
| `error` | Only errors |
| `warn` | Errors and warnings |
| `info` | Normal operational messages (default) |
| `debug` | Verbose — includes tRPC procedure calls, DB queries |

```env
LOG_LEVEL=info
```

---

## Port variables

These control which host ports the container binds to. The container-internal ports are fixed.

### `PROXYOS_DASHBOARD_PORT`

Host port that maps to the Next.js dashboard (container port `3000`).

```env
PROXYOS_DASHBOARD_PORT=3091
```

### `PROXYOS_HTTP_PORT`

Host port that maps to Caddy's HTTP listener (container port `80`).

```env
PROXYOS_HTTP_PORT=80
```

### `PROXYOS_HTTPS_PORT`

Host port that maps to Caddy's HTTPS listener (container port `443`). Also bound for UDP (HTTP/3 QUIC).

```env
PROXYOS_HTTPS_PORT=443
```

---

## Internal / baked-in variables

These are set in the Dockerfile and are not normally overridden. They are documented here for reference when debugging inside the container.

| Variable | Default | Description |
|---|---|---|
| `PROXYOS_DB_PATH` | `/data/proxyos/proxyos.db` | Path to the SQLite database file |
| `PROXYOS_ACCESS_LOG` | `/data/proxyos/access.log` | Path to the Caddy access log |
| `CADDY_BASE_CONFIG_PATH` | `/etc/caddy/base-config.json` | Caddy bootstrap config (baked into the image, not in a volume) |
| `CADDY_ADMIN_URL` | `http://localhost:2019` | URL of the Caddy Admin API (internal only) |
| `XDG_DATA_HOME` | `/data/caddy` | Where Caddy stores certificates and ACME state |
| `XDG_CONFIG_HOME` | `/config/caddy` | Where Caddy stores runtime config |
| `NODE_ENV` | `production` | Always `production` in the container |
| `PORT` | `3000` | Internal port the Next.js app listens on |
| `HOSTNAME` | `0.0.0.0` | Bind address for the Next.js app |

---

## Volume mounts

| Host path | Container path | Purpose |
|---|---|---|
| `proxyos-data` (named volume) | `/data/proxyos` | SQLite database, access log |
| `caddy-data` (named volume) | `/data/caddy` | TLS certificates, ACME accounts |
| `caddy-config` (named volume) | `/config/caddy` | Caddy runtime config |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Read-only Docker socket for network/container discovery |

> **Security note:** The Docker socket mount is required for the container scanner and Docker network auto-discovery features. Mount it read-only (`:ro`) as shown in the compose file.

---

## Exposed ports

| Container port | Protocol | Purpose |
|---|---|---|
| `80` | TCP | Caddy HTTP (ACME HTTP-01 challenges, HTTP→HTTPS redirects) |
| `443` | TCP + UDP | Caddy HTTPS (TLS) and HTTP/3 (QUIC over UDP) |
| `3000` | TCP | Next.js dashboard (mapped to `PROXYOS_DASHBOARD_PORT` on the host) |
| `2019` | TCP | Caddy Admin API — **intentionally not exposed to the host** |

---

## DNS settings

The compose file hard-codes DNS servers to `8.8.8.8` and `1.1.1.1`. This prevents a known issue where the container loses DNS resolution after a rebuild because it inherits a stale `/etc/resolv.conf` from the Docker daemon. See [Cloudflared DNS errors](../troubleshooting/cloudflared-dns-errors.md) for details.
