# Trusted Proxies

`trusted_proxies` is a Caddy server-level setting that controls which upstream IP addresses are trusted to set forwarding headers (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`).

---

## Why it matters

When a request passes through a proxy before reaching Caddy, the connection IP is the proxy's IP — not the real visitor. The proxy signals the real IP via `X-Forwarded-For`.

If Caddy trusts that proxy, it uses the forwarded IP as the real client IP. If Caddy does not trust the proxy, it ignores the forwarded headers and uses the connection IP (the proxy's IP) as the client IP.

This affects:
- Rate limiting (key defaults to `{remote_host}` — real IP vs. proxy IP)
- IP allowlists/denylists on routes
- Upstream services that use `X-Forwarded-For` to identify clients
- GeoIP-based access control
- Access logs (client IP field)

---

## ProxyOS default trusted ranges

ProxyOS configures `trusted_proxies` at the Caddy server level with a static list of ranges. The list is built by `buildTrustedProxies()` in `packages/caddy/src/config.ts` and applied to the Caddy server config at startup and on every route regeneration.

### Cloudflare (IPv4)

```
173.245.48.0/20    103.21.244.0/22    103.22.200.0/22    103.31.4.0/22
141.101.64.0/18    108.162.192.0/18   190.93.240.0/20    188.114.96.0/20
197.234.240.0/22   198.41.128.0/17    162.158.0.0/15     104.16.0.0/13
104.24.0.0/14      172.64.0.0/13      131.0.72.0/22
```

### Cloudflare (IPv6)

```
2400:cb00::/32    2606:4700::/32    2803:f800::/32
2405:b500::/32    2405:8100::/32    2a06:98c0::/29    2c0f:f248::/32
```

### Private LAN (RFC1918)

```
10.0.0.0/8        172.16.0.0/12     192.168.0.0/16
```

These cover any other reverse proxy or load balancer running on the same LAN.

### Loopback

```
127.0.0.0/8       ::1/128
```

### Tailscale CGNAT

```
100.64.0.0/10
```

Covers Tailscale exit nodes and Tailscale-connected hosts acting as proxies.

### Docker default bridge networks

```
172.17.0.0/16    172.18.0.0/16    172.19.0.0/16    172.20.0.0/16
```

Covers other Docker containers on the default bridge networks proxying through ProxyOS, and ProxyOS itself proxying from container to upstream.

---

## Security implications

Trusting an IP range means Caddy will accept `X-Forwarded-For` headers from any IP in that range **without verification**. If an attacker can send requests from a trusted IP range (e.g., from inside the same Docker network), they can spoof the client IP in the forwarding header.

**What this means practically:**

- If an attacker on your LAN sends `X-Forwarded-For: 1.2.3.4`, Caddy will treat the request as coming from `1.2.3.4`
- This can bypass IP allowlists configured on routes
- Rate limiting would be applied to `1.2.3.4` instead of the attacker's real IP

**Mitigations:**

- Keep your LAN trusted (this is unavoidable for local setups)
- Use route-level IP allowlists only for truly private services
- For public-facing services, rely on Cloudflare's IP restrictions rather than ProxyOS IP allowlists, since Cloudflare validates requests at the edge

---

## Customizing trusted_proxies

The trusted ranges are currently hardcoded in `packages/caddy/src/config.ts`. There is a TODO in the codebase to make this configurable via environment variable or settings page. Until that is implemented, customizing the ranges requires modifying the source code and rebuilding the image.

---

## Related

- [Behind Cloudflare Tunnel](behind-cloudflare-tunnel.md)
- [Behind Another Proxy](behind-another-proxy.md)
- [Core Concepts](../getting-started/concepts.md)
