# Environment Variables

> Complete reference for all environment variables that affect ProxyOS behavior.

## What it does

ProxyOS is configured entirely through environment variables. There is no config file — all settings are passed via `env_file:` or `environment:` in `docker-compose.yml`.

## Required variables

| Variable | Description |
|---|---|
| `PROXYOS_SECRET` | Secret used to sign session tokens. Changing it invalidates all active sessions. Generate with `openssl rand -hex 32`. |

## Optional variables

| Variable | Default | Description |
|---|---|---|
| `PROXYOS_URL` | (derived from request) | Public URL of the dashboard. Used for OAuth callbacks and email links. |
| `LOG_LEVEL` | `info` | Log verbosity: `error`, `warn`, `info`, `debug` |
| `PROXYOS_DASHBOARD_PORT` | `3000` | Host port for the dashboard (mapped to container port 3000) |
| `PROXYOS_HTTP_PORT` | `80` | Host port for Caddy HTTP |
| `PROXYOS_HTTPS_PORT` | `443` | Host port for Caddy HTTPS and HTTP/3 UDP |

## Internal variables (baked into image)

These are set in the Dockerfile and should not normally be overridden. They document the internal layout of the container.

| Variable | Value | Description |
|---|---|---|
| `PROXYOS_DB_PATH` | `/data/proxyos/proxyos.db` | SQLite database path |
| `PROXYOS_ACCESS_LOG` | `/data/proxyos/access.log` | Caddy access log path |
| `CADDY_BASE_CONFIG_PATH` | `/etc/caddy/base-config.json` | Bootstrap Caddy config (baked into image, not in volume) |
| `CADDY_ADMIN_URL` | `http://localhost:2019` | Caddy Admin API URL (internal, never published) |
| `XDG_DATA_HOME` | `/data/caddy` | Caddy certificate and ACME storage |
| `XDG_CONFIG_HOME` | `/config/caddy` | Caddy runtime config directory |
| `NODE_ENV` | `production` | Always production in the container |
| `PORT` | `3000` | Internal Next.js listen port |
| `HOSTNAME` | `0.0.0.0` | Next.js bind address |

## Troubleshooting

- Container exits immediately: `PROXYOS_SECRET` is missing — the startup guard calls `process.exit(1)` if it is not set in `NODE_ENV=production`
- See [Container Won't Start](../troubleshooting/container-wont-start.md)
- See [Docker Compose Reference](../getting-started/docker-compose-reference.md) for a full `.env` example
