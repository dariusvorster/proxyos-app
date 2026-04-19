# ProxyOS Documentation

ProxyOS is a self-hosted reverse proxy manager built on Caddy v2. It runs as a single Docker container using s6-overlay to supervise Caddy and the Node.js API together.

---

## Quick Links

| Document | Description |
|---|---|
| [Setup](setup.md) | Install and run ProxyOS with Docker |
| [Expose a service](how-to/expose-service.md) | Route traffic to a backend |
| [SSL/TLS](how-to/ssl-tls.md) | Configure certificates |
| [SSO](how-to/sso.md) | Protect routes with OAuth2 |
| [Federation](how-to/federation.md) | Multi-node central/node setup |
| [Analytics](how-to/analytics.md) | Traffic metrics and dashboards |
| [Feature reference](reference/features.md) | All features by category |
| [Environment variables](reference/environment.md) | Full env var reference |

---

## Architecture

```
                         +---------------------------+
                         |   Docker Container        |
                         |                           |
Internet --> 80/443 -->  |  Caddy v2 (reverse proxy) |
                         |      |                    |
                         |  s6-overlay supervisor    |
                         |      |                    |
             :3000 <--   |  Node.js API (tRPC)       |
                         |      |                    |
                         |  SQLite (Drizzle ORM)     |
                         +---------------------------+
                                  |
                         /var/run/docker.sock  (Docker scanner)
                         /data/proxyos/        (DB + logs)
                         /data/caddy/          (Caddy TLS state)
```

Caddy is controlled via its Admin API on `localhost:2019`. ProxyOS builds Caddy JSON config objects and pushes them via that API — there is no Caddyfile.

---

## Feature Summary

**Routing:** Routes, upstreams, TLS modes, WebSocket, HTTP/2+3, compression, headers

**Security:** WAF (Coraza), SSO/OAuth2, Access Lists, AccessOS group ACLs, API keys, RBAC

**Automation:** Scheduled changes, DDNS updater, blue-green deploys, health checks, config drift detection, traffic replay

**Observability:** Analytics dashboard, Prometheus metrics, cert health monitor, CT monitor, slow request log, live heatmap

**Operations:** Backup/restore, audit log, PatchOS maintenance mode, Docker Scanner, route import (Traefik/compose)

**Integrations:** Cloudflare DNS-01, LockBoxOS/Vault secrets, MxWatch email monitoring, InfraOS API, Lemon Squeezy billing

**Federation:** Central/node architecture for managing multiple ProxyOS instances from one UI

---

## Ports

| Port | Purpose |
|---|---|
| 80 | HTTP proxy traffic (and ACME HTTP-01 challenges) |
| 443 | HTTPS proxy traffic |
| 3000 | Web UI |
| 7890 | Federation WebSocket (node enrollment) |
