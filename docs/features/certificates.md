# Certificates

> ProxyOS exposes Caddy's certificate management through the dashboard, showing the status of all TLS certificates.

## What it does

Caddy manages TLS certificates automatically. ProxyOS surfaces certificate data in the `certificates` table (populated by polling the Caddy Admin API) and provides a certificate management UI.

Features:
- View all active certificates with expiry dates and renewal status
- Certificate Transparency (CT) monitoring — alerts when unexpected certificates are issued for your domains
- Multi-domain certificate grouping
- ACME account management (rate limit tracking)

## When to use it

- Monitor certificate expiry and renewal health
- Configure DNS-01 challenge providers for wildcard certificates
- View CT log alerts for domains you manage
- Upload custom certificates (`tlsMode: custom`)

## How to configure

### DNS providers (for DNS-01 / wildcard certs)

Go to **Settings → DNS Providers → New DNS Provider**:

| Field | Description |
|---|---|
| Name | Label |
| Type | Provider type (e.g., `cloudflare`) |
| Credentials | JSON credentials (API token, zone ID, etc.) |

Once a DNS provider is added, routes with `tlsMode: dns` will use it for DNS-01 challenges.

### Certificate Transparency alerts

CT monitoring checks the crt.sh log for new certificates issued for your domains. Unexpected certificates (issued by a CA you don't use, or at a time you didn't request them) may indicate domain hijacking. CT alerts are stored in `ct_alerts` and shown in the dashboard notification area.

### Auto-renewal

Caddy renews certificates automatically before expiry (typically 30 days before). No manual action is needed. The `auto_renew` flag in the `certificates` table reflects whether Caddy has auto-renewal enabled for each cert.

## Troubleshooting

- **Certificate not renewing**: Check `caddy-data` volume is mounted and has write permissions. Caddy stores ACME state there.
- **DNS-01 failing**: Verify DNS provider credentials and that the provider has permission to create `_acme-challenge` TXT records
- **CT alerts for your own domains**: These are informational. If the issuer and timing match your Caddy setup, acknowledge the alert. If unexpected, investigate immediately.
