# ProxyOS Documentation

ProxyOS is a self-hosted reverse proxy manager that runs Caddy and a Next.js dashboard together in a single container using s6-overlay. You create routes through the web UI; ProxyOS translates them into live Caddy configuration via the Caddy Admin API — no Caddyfile required.

---

## Getting Started

| | |
|---|---|
| [Installation](getting-started/installation.md) | Docker Compose setup, prerequisites, `.env` file, first boot |
| [Your First Route](getting-started/first-route.md) | Log in, expose a service, test with curl |
| [Core Concepts](getting-started/concepts.md) | Routes, host types, TLS modes, trusted proxies |
| [Docker Compose Reference](getting-started/docker-compose-reference.md) | Every environment variable explained |

---

## Features

### Routes
- [Creating Routes](features/routes/creating-routes.md)
- [Upstream Configuration](features/routes/upstream-configuration.md)
- [TLS Modes](features/routes/tls-modes.md)
- [Health Checks](features/routes/health-checks.md)
- [Headers](features/routes/headers.md)
- [Load Balancing](features/routes/load-balancing.md)
- [Rate Limiting](features/routes/rate-limiting.md)
- [WAF](features/routes/waf.md)
- [WebSockets](features/routes/websockets.md)

### Host Types
- [Redirect Hosts](features/redirect-hosts.md)
- [Error Hosts](features/error-hosts.md)
- [Streams (TCP/UDP)](features/streams.md)

### Security & Access
- [SSO / Forward Auth](features/sso.md)
- [Certificates](features/certificates.md)

### Observability
- [Analytics](features/analytics.md)
- [Upstream Health](features/upstream-health.md)
- [Audit Log](features/audit-log.md)
- [Scanner](features/scanner.md)

### Advanced
- [Federation](features/federation.md)
- [Docker Networks](features/docker-networks.md)

---

## Deployment

- [Behind Cloudflare Tunnel](deployment/behind-cloudflare-tunnel.md)
- [Trusted Proxies](deployment/trusted-proxies.md)
- [Behind Another Proxy](deployment/behind-another-proxy.md)
- [Direct LAN](deployment/direct-lan.md)
- [Tailscale](deployment/tailscale.md)
- [Multi-Host Federation](deployment/multi-host-federation.md)

---

## Troubleshooting

- [Problem Index](troubleshooting/index.md)
- [Not Authenticated / 401 after login](troubleshooting/not-authenticated.md)
- [Holding page shown instead of service](troubleshooting/holding-page-shown.md)
- [Mixed content errors](troubleshooting/mixed-content-errors.md)
- [502 Bad Gateway](troubleshooting/502-bad-gateway.md)
- [Cloudflared DNS errors after rebuild](troubleshooting/cloudflared-dns-errors.md)
- [HTTPS upstream connection refused](troubleshooting/https-upstream-connection-refused.md)
- [Upstream health check failed](troubleshooting/upstream-health-failed.md)
- [Routes not saving](troubleshooting/routes-not-saving.md)
- [Container won't start](troubleshooting/container-wont-start.md)
- [Cookie not persisting](troubleshooting/cookie-not-persisting.md)
- [Secret rotation logs everyone out](troubleshooting/secret-rotation-logout.md)

---

## Admin

- [Environment Variables](admin/environment-variables.md)
- [Secrets Management](admin/secrets-management.md)
- [Logging](admin/logging.md)
- [Database](admin/database.md)
- [Backup and Restore](admin/backup-and-restore.md)
- [Upgrades](admin/upgrades.md)
- [Security Hardening](admin/security-hardening.md)

---

## API

- [Authentication](api/authentication.md)
- [Routes Endpoints](api/routes-endpoints.md)
- [Scopes and Permissions](api/scopes-and-permissions.md)

---

## Changelog

- [Changelog](changelog.md)
