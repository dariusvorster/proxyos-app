# TLS Modes

> TLS mode controls how Caddy obtains and manages the certificate for a route's domain.

## What it does

ProxyOS translates the `tlsMode` field on a route into Caddy TLS policy configuration. Caddy handles certificate issuance, renewal, and storage automatically in all modes except `off`.

## When to use it

Choose a TLS mode based on where your domain resolves and whether it's publicly reachable:

| Mode | Use case |
|---|---|
| `auto` | Public domain, port 80 open — Let's Encrypt HTTP-01 |
| `dns` | Wildcard certs; private/LAN domains; when port 80 is blocked |
| `internal` | LAN-only; no public cert needed; self-signed acceptable |
| `custom` | You manage certs externally and upload them |
| `off` | HTTP only — no TLS at all |

## How to configure

Select **TLS Mode** when creating or editing a route.

### `auto`
Caddy uses Let's Encrypt HTTP-01 ACME challenge. Port 80 must be reachable from the internet. Certificates renew automatically.

### `dns`
Caddy uses DNS-01 ACME challenge. Requires a [DNS provider](../../admin/environment-variables.md) configured in Settings → DNS Providers. Works for wildcard domains (`*.yourdomain.com`) and private/internal domains where port 80 is not publicly accessible.

### `internal`
Caddy issues a certificate from its own internal CA. The cert is self-signed (not trusted by browsers by default). Install the Caddy CA root cert in your browser/device trust store if you want the green padlock for LAN services.

### `custom`
Upload a PEM certificate and private key through Settings → Certificates.

### `off`
No TLS. Caddy accepts plain HTTP connections only. Use this only for services on a fully trusted internal network.

## Troubleshooting

- Wildcard domains with `auto` mode automatically fall back to `dns` (if a DNS provider is configured) or `internal`
- If DNS-01 is failing, check the DNS provider credentials in Settings → DNS Providers
- `internal` certs will show as untrusted in browsers until you install the Caddy CA root
