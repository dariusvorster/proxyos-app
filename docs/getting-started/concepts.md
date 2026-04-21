# Core Concepts

---

## What ProxyOS is

ProxyOS is a management layer on top of [Caddy v2](https://caddyserver.com/). Caddy does the actual proxying; ProxyOS provides:

- A web dashboard for creating and editing routes
- A SQLite database that stores route configuration
- A sync engine that translates database records into Caddy JSON config and pushes them to the Caddy Admin API (`localhost:2019`)
- Roundtrip drift detection that verifies what Caddy actually has loaded matches what ProxyOS expects

The Caddy Admin API port (`2019`) is intentionally not published to the host — it is only reachable inside the container.

---

## Routes

A **route** maps an incoming hostname (domain) to one or more upstream services. When a request arrives for `app.yourdomain.com`, Caddy matches it against the route and reverse-proxies it to the configured upstream address.

Each route stores:

- **Domain** — the hostname Caddy will match (`app.yourdomain.com`)
- **Upstreams** — one or more backend addresses (`http://192.168.1.10:3000`)
- **TLS mode** — how Caddy obtains a certificate for the domain
- Optional middleware: rate limiting, WAF, SSO, basic auth, headers, compression, health checks

Routes are the primary object in ProxyOS. Everything else (redirect hosts, error hosts, streams) is a simpler variant.

---

## Host types

### Proxy routes (standard routes)

Reverse-proxy traffic to an upstream service. This is what most users create.

### Redirect hosts

Map a domain to a redirect. Useful for `www` → apex redirects or moving a service to a new domain. Supports 301/302, path preservation, and query string preservation. Stored in the `redirect_hosts` table.

### Error hosts

Serve a static error page (or redirect) for a domain. Useful for taking down a service gracefully or parking a domain. Supports default HTML, custom HTML, or redirect. Status code is configurable. Stored in the `error_hosts` table.

### Streams

TCP or UDP port forwarding at layer 4, using the `caddy-l4` plugin. A stream listens on a port and forwards to an upstream host:port. No HTTP parsing — raw bytes are forwarded. Useful for databases, MQTT brokers, game servers, etc.

---

## TLS modes

Each route has a `tlsMode` field that controls how Caddy obtains a certificate:

| Mode | Description | When to use |
|---|---|---|
| `auto` | ACME HTTP-01 challenge via Let's Encrypt | Public domains with port 80 accessible |
| `dns` | ACME DNS-01 challenge using a configured DNS provider | Wildcard certs; private domains; when port 80 is blocked |
| `internal` | Caddy's built-in internal CA (self-signed) | LAN-only services where you don't need a public cert |
| `custom` | BYO certificate (uploaded through the dashboard) | When you manage certs externally |
| `off` | No TLS — HTTP only | Internal services on trusted networks only |

**Wildcard domains** (`*.yourdomain.com`) automatically upgrade from `auto` to `dns` (if a DNS provider is configured) or `internal` (if not), because HTTP-01 cannot validate wildcards.

**HTTPS upstreams** — if your upstream is on port 443, 8006, 8007, 8443, 9090, 9443, or 10443, ProxyOS auto-detects it as HTTPS and enables the TLS transport block in Caddy. Port-detected HTTPS also enables `insecure_skip_verify` automatically (self-signed certs are common on services like Proxmox).

---

## Upstreams

An upstream is the backend address ProxyOS proxies to. Format:

```
http://hostname:port
https://hostname:port
hostname:port          (scheme inferred from port)
```

Multiple upstreams trigger load balancing. Supported policies: `round_robin`, `least_conn`, `ip_hash`, `random`, `weighted_round_robin` (when weights are set).

---

## trusted_proxies

`trusted_proxies` is a Caddy server-level setting that tells Caddy which IP ranges to trust for `X-Forwarded-*` headers. When a request arrives from a trusted proxy, Caddy uses the forwarded IP (from `X-Forwarded-For`) as the real client IP instead of the connection IP.

ProxyOS configures `trusted_proxies` at the server level (not per-route). The default set includes:

- All Cloudflare IP ranges (IPv4 and IPv6)
- RFC1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Loopback (`127.0.0.0/8`, `::1/128`)
- Tailscale CGNAT (`100.64.0.0/10`)
- Docker default bridge networks (`172.17.0.0/16` through `172.20.0.0/16`)

This means if you run ProxyOS behind Cloudflare, Tailscale, or another reverse proxy on the same host, the real client IP is correctly propagated to your upstream services.

See [Trusted Proxies](../deployment/trusted-proxies.md) for security implications.

---

## Sync and drift detection

Every time a route is saved, ProxyOS pushes the configuration to Caddy and then reads it back to verify what Caddy loaded matches what was intended. The result is stored as `sync_status` on the route:

| Status | Meaning |
|---|---|
| `synced` | Caddy config matches the database |
| `drift` | Caddy config differs — click **Re-push** on the route detail page |
| `patchos` | Drift caused by a PatchOS maintenance push — expected, shown in grey |
| `scheduled` | Drift caused by a scheduled change — expected, shown in grey |

---

## Single-container architecture

Both Caddy and the Next.js app run inside one Docker image, supervised by s6-overlay:

```
Docker container
├── s6-overlay (PID 1)
├── Caddy process  — listens on :80 and :443
└── Node.js process — Next.js app on :3000 (internal)
```

The dashboard port is mapped to the host via `PROXYOS_DASHBOARD_PORT`. Caddy's Admin API (`localhost:2019`) stays internal and is never published.

Data lives in three Docker volumes: `proxyos-data` (SQLite DB + access log), `caddy-data` (certificates), and `caddy-config` (runtime config).
