# Deployment: Behind Tailscale

> Running ProxyOS so that services are accessible through your Tailscale mesh network.

## What it does

Tailscale assigns a MagicDNS name and a `100.x.x.x` (CGNAT) IP to each machine on your tailnet. ProxyOS can be deployed so that its ports are accessible on the Tailscale IP, making services available to all tailnet members without exposing them to the internet.

## When to use it

Use this topology for:
- Secure access to home lab services from anywhere on your tailnet
- Services that should be accessible to specific users via Tailscale ACLs
- Avoiding public internet exposure without requiring a Cloudflare account

## How to configure

### Option A: ProxyOS on the Tailscale IP only

Bind ProxyOS to the Tailscale IP instead of `0.0.0.0`:

In `docker-compose.yml`:

```yaml
ports:
  - "100.x.x.x:80:80"
  - "100.x.x.x:443:443"
  - "100.x.x.x:3091:3000"
```

Replace `100.x.x.x` with your machine's Tailscale IP.

### Option B: ProxyOS on all interfaces, accessed via Tailscale

Bind normally and use Tailscale ACLs to restrict which devices can reach ProxyOS.

### TLS for Tailscale-only services

**TLS Mode `internal`**: Caddy issues a self-signed cert. Install the Caddy root CA on devices that need the green padlock.

**TLS Mode `auto`** with a public DNS record pointing to a private Tailscale IP: Use a real public domain (e.g., `service.yourdomain.com`) with a DNS A record pointing to your Tailscale IP (`100.x.x.x`). Let's Encrypt issues a real certificate via HTTP-01 challenge. Access is still Tailscale-only since the IP is not publicly routable.

**Tailscale HTTPS (MagicDNS TLS)**: If you use Tailscale's built-in HTTPS feature, the `*.ts.net` domain gets a valid certificate. Point ProxyOS upstreams at Tailscale MagicDNS names.

### trusted_proxies

The Tailscale CGNAT range (`100.64.0.0/10`) is included in ProxyOS's default `trusted_proxies`. If ProxyOS is behind a Tailscale exit node or a Tailscale-connected load balancer, `X-Forwarded-For` headers from that node are trusted.

## Troubleshooting

- Services not reachable on Tailscale IP: verify the ProxyOS container is binding to the Tailscale interface
- Certificate errors: for `internal` certs, install the Caddy root CA on your client devices
- DNS not resolving: ensure your Tailscale MagicDNS is configured or use a local DNS override
