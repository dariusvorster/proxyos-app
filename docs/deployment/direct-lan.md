# Deployment: Direct LAN

> Running ProxyOS directly on your LAN, without a tunnel or upstream proxy.

## What it does

In a direct LAN deployment, ProxyOS binds to ports 80 and 443 on the host machine and handles all TLS directly. Clients on the same network connect directly to ProxyOS.

## When to use it

Use direct LAN deployment for:
- Home lab setups where all clients are on the same network
- Services that should never be internet-accessible
- Situations where Cloudflare Tunnel or a VPN is not available or desired

## How to configure

Use the default `docker-compose.yml` with no port changes:

```env
PROXYOS_HTTP_PORT=80
PROXYOS_HTTPS_PORT=443
PROXYOS_DASHBOARD_PORT=3091
```

### TLS for LAN services

For LAN-only domains, use **TLS Mode `internal`**. Caddy issues certificates from its internal CA. To get a green padlock in your browser:

1. Extract the Caddy root CA certificate from the container:
   ```bash
   docker compose exec proxyos cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt
   ```
2. Install `caddy-root.crt` in your browser's or operating system's trust store

For services accessible from mobile devices or shared with others, use **TLS Mode `auto`** with a real public domain (even for a LAN service — the DNS record can point to a private IP).

### DNS resolution

For `.local` or custom LAN domains, configure your router's DNS or a local resolver (Pi-hole, AdGuard Home, Unbound) to resolve your domains to the ProxyOS host IP.

## Troubleshooting

- Port 80/443 already in use: check for existing nginx, Apache, or another Caddy instance on the host
- `internal` cert not trusted: install the Caddy root CA in your device's trust store
- LAN domains not resolving: configure your local DNS to point the domain to the ProxyOS host
