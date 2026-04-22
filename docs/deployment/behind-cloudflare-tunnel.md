# Deployment: Behind Cloudflare Tunnel

This guide covers running ProxyOS behind a Cloudflare Tunnel (`cloudflared`). In this topology, `cloudflared` runs on your network, creates an outbound tunnel to Cloudflare's edge, and Cloudflare forwards incoming HTTP/HTTPS requests to ProxyOS.

---

## Architecture

```
Internet → Cloudflare Edge → cloudflared (outbound tunnel) → ProxyOS (Caddy) → Upstream services
```

Benefits:
- No inbound firewall ports to open (80/443 can be closed on the host)
- Cloudflare handles DDoS and acts as a WAF layer in front of ProxyOS
- Your origin IP stays hidden

---

## Prerequisites

- A Cloudflare account with a zone (domain) managed by Cloudflare
- `cloudflared` installed on the same host as ProxyOS (or on a host that can reach ProxyOS)
- A Cloudflare Tunnel configured to send traffic to `http://proxyos-host:80` or `https://proxyos-host:443`

---

## Cloudflare Tunnel configuration

### Option A: Tunnel to ProxyOS HTTP port

Configure the tunnel ingress to forward to ProxyOS's HTTP port:

```yaml
# ~/.cloudflared/config.yml
tunnel: your-tunnel-id
credentials-file: /home/user/.cloudflared/your-tunnel-id.json

ingress:
  - hostname: "*.yourdomain.com"
    service: http://localhost:80
  - hostname: yourdomain.com
    service: http://localhost:80
  - service: http_status:404
```

ProxyOS will handle TLS termination. Caddy receives HTTP from `cloudflared` and uses the `X-Forwarded-Proto: https` header (set by Cloudflare) to know the original connection was HTTPS.

### Option B: Tunnel to ProxyOS HTTPS port

```yaml
ingress:
  - hostname: "*.yourdomain.com"
    service: https://localhost:443
    originRequest:
      noTLSVerify: true    # needed if ProxyOS uses internal/self-signed certs
```

In this mode, Cloudflare's edge terminates the public TLS, cloudflared re-encrypts to your origin.

---

## TLS modes for routes

When behind Cloudflare Tunnel with Option A (HTTP to ProxyOS):

- **TLS Mode `off`** — Caddy listens on HTTP only. Cloudflare provides the public TLS. This is the simplest setup.
- **TLS Mode `internal`** — Caddy issues a self-signed cert. Use with Option B (`noTLSVerify: true`).
- **TLS Mode `auto`** — Let's Encrypt. Requires Cloudflare to forward ACME HTTP-01 challenges, which cloudflared does not do by default. Use DNS-01 (`dns` mode) instead.
- **TLS Mode `dns`** — DNS-01 challenge via Cloudflare DNS provider. Works well with tunnels.

---

## trusted_proxies

ProxyOS includes all Cloudflare IP ranges in its default `trusted_proxies` configuration. This means Caddy will trust `X-Forwarded-For` and `X-Forwarded-Proto` headers from Cloudflare:

**IPv4 Cloudflare ranges (included by default):**
```
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

**IPv6 Cloudflare ranges (included by default):**
```
2400:cb00::/32, 2606:4700::/32, 2803:f800::/32
2405:b500::/32, 2405:8100::/32, 2a06:98c0::/29, 2c0f:f248::/32
```

Your upstream services will receive the real visitor IP in the `X-Forwarded-For` header, correctly propagated through Caddy.

---

## DNS resolution bug on rebuild

After rebuilding or recreating the ProxyOS container, you may see `server misbehaving` DNS errors in the logs. This happens because Docker inherits `/etc/resolv.conf` from the host, which may point to a local `cloudflared` DNS resolver not accessible inside the container's network namespace.

**Fix: Always include `dns:` in docker-compose.yml**

```yaml
services:
  proxyos:
    dns:
      - 8.8.8.8
      - 1.1.1.1
```

This is included in the reference compose file. See [Cloudflared DNS Errors](../troubleshooting/cloudflared-dns-errors.md) for details.

---

## Surviving ProxyOS container rebuilds

### The Problem

When you run `docker compose up --build` to rebuild ProxyOS, Docker destroys the old container and creates a new one. The new container gets a **new internal IP address**. If `cloudflared` is configured to point at the old IP — either explicitly, or because it resolved the container name at startup and cached the result — the tunnel breaks until `cloudflared` is restarted.

Default bridge networks (`bridge`) do not guarantee that container names resolve via DNS inside other containers. This means `proxyos` as a hostname may not be reachable from a `cloudflared` container on the default network.

### Why This Happens

Docker assigns IPs from a pool. On the default bridge network:

- Container names are **not** reliably resolvable by other containers (only `/etc/hosts` entries for linked containers, which is a legacy feature).
- When a container restarts, its IP changes. Anything that resolved the old IP and cached it will point at a dead address.
- `cloudflared`'s distroless base image has no shell, which causes Docker's built-in `healthcheck` to fail — the check executor can't run a command inside the container. This causes `cloudflared` to be permanently reported as `unhealthy`, which blocks dependent services from starting.

### Solution: User-Defined Network + Container Names

User-defined Docker networks enable **Docker's embedded DNS** (`127.0.0.11`). On a user-defined network, every container is reachable by its service name (container name), and Docker re-resolves that name on every connection. When ProxyOS is rebuilt and gets a new IP, the next connection from `cloudflared` resolves the new IP automatically — no restart needed.

**Step 1 — Create a shared user-defined network**

```yaml
# docker-compose.yml (top-level networks block)
networks:
  proxy-net:
    driver: bridge
```

**Step 2 — Attach both services to the shared network**

```yaml
services:
  proxyos:
    image: proxyos:latest
    container_name: proxyos
    networks:
      - proxy-net
    ports:
      - "80:80"
      - "443:443"

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    networks:
      - proxy-net
    command: tunnel --no-autoupdate run
    volumes:
      - ~/.cloudflared:/etc/cloudflared:ro
    restart: unless-stopped
    # No healthcheck — cloudflared uses a distroless image with no shell.
    # Docker healthchecks require a shell to exec into the container.
    # Adding a healthcheck will cause the container to be permanently
    # reported as unhealthy, which can block dependent services.

networks:
  proxy-net:
    driver: bridge
```

**Step 3 — Point cloudflared at ProxyOS by container name**

```yaml
# ~/.cloudflared/config.yml
tunnel: your-tunnel-id
credentials-file: /etc/cloudflared/your-tunnel-id.json

ingress:
  - hostname: "*.yourdomain.com"
    service: http://proxyos:80
  - hostname: yourdomain.com
    service: http://proxyos:80
  - service: http_status:404
```

`proxyos` here is the container name. Docker's embedded DNS resolves it via `127.0.0.11` on every new connection. When ProxyOS is rebuilt, the next request from `cloudflared` automatically picks up the new IP — no `cloudflared` restart required.

### Sidecar Alternative

If you prefer to keep everything in one compose file and guarantee that `cloudflared` always shares the same network namespace as ProxyOS, run `cloudflared` as a sidecar:

```yaml
services:
  proxyos:
    image: proxyos:latest
    container_name: proxyos
    ports:
      - "80:80"
      - "443:443"
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    network_mode: "service:proxyos"   # shares ProxyOS network namespace
    command: tunnel --no-autoupdate run
    volumes:
      - ~/.cloudflared:/etc/cloudflared:ro
    restart: unless-stopped
    depends_on:
      - proxyos
    # No healthcheck — distroless image, no shell available.
```

With `network_mode: "service:proxyos"`, `cloudflared` talks to ProxyOS via `localhost` instead of a container name. When ProxyOS is rebuilt, `cloudflared` must also be restarted (since it shares the same network namespace, which is destroyed with the ProxyOS container). Use this pattern only if you prefer `localhost` routing over inter-container DNS.

For most homelab setups, the **user-defined network + container name** approach in the previous section is simpler and more resilient.

### How ProxyOS Handles Its Own Upstreams

ProxyOS (Task 4A) configures Caddy's `reverse_proxy` transport to use Docker's embedded DNS resolver (`127.0.0.11`) for all upstream lookups. This means:

- Routes whose upstream is set to a **container name** (e.g., `http://my-app:3000`) will re-resolve on every request via Docker DNS.
- When an upstream container is rebuilt and gets a new IP, ProxyOS continues routing correctly without any route reconfiguration.
- This applies to all routes — you do not need to set per-route resolver options.

To take advantage of this, set your route upstreams to container names, not IP addresses, and ensure all containers are on the same user-defined Docker network as ProxyOS.

---

## Mixed content fix

If your upstream services generate `http://` URLs when they should generate `https://`, force the `X-Forwarded-Proto` header on the route:

1. Edit the route in ProxyOS
2. Go to **Headers**
3. Add request header: `X-Forwarded-Proto` = `https`

Or configure the upstream service to know its canonical URL is `https://`.

---

## Verify end-to-end

```bash
# Check that real client IP is propagated
curl -H "CF-Connecting-IP: 1.2.3.4" https://your-route-domain/ -v 2>&1 | grep -i "x-real-ip\|x-forwarded"

# Check the route sync status in the dashboard
# Routes list → Sync column should show "synced"
```

---

## Related

- [Trusted Proxies](trusted-proxies.md)
- [Mixed Content Errors](../troubleshooting/mixed-content-errors.md)
- [Cloudflared DNS Errors](../troubleshooting/cloudflared-dns-errors.md)
- [TLS Modes](../features/routes/tls-modes.md)
