# Redirect Hosts

> A redirect host maps a source domain to a destination URL with an HTTP redirect.

## What it does

A redirect host creates a Caddy route that responds to all requests for a domain with an HTTP redirect to a configured destination URL. No upstream proxying is involved — Caddy handles the redirect entirely.

Redirect hosts are stored in the `redirect_hosts` table, separate from proxy routes.

## When to use it

- `www.yourdomain.com` → `https://yourdomain.com` (apex redirect)
- `old-service.yourdomain.com` → `https://new-service.yourdomain.com` (domain migration)
- `yourdomain.com/app` → `https://app.yourdomain.com` (subdomain redirect)
- Parking a domain while a service is being rebuilt

## How to configure

Navigate to **Hosts → Redirect Hosts → New Redirect Host**:

| Field | Default | Description |
|---|---|---|
| Source domain | — | The hostname to redirect from |
| Destination URL | — | The URL to redirect to |
| Redirect code | `301` | `301` (permanent) or `302` (temporary) |
| Preserve path | `true` | Append the original path to the destination URL |
| Preserve query | `true` | Append the original query string |
| TLS enabled | `true` | Whether Caddy should handle HTTPS for the source domain |

### Path and query preservation

With `Preserve path: true` and `Preserve query: true`:
```
https://old.example.com/page?q=1  →  https://new.example.com/page?q=1
```

With `Preserve path: true`, `Preserve query: false`:
```
https://old.example.com/page?q=1  →  https://new.example.com/page
```

With both disabled:
```
https://old.example.com/page?q=1  →  https://new.example.com
```

## Troubleshooting

- If the source domain is already used by a proxy route or error host, save will fail with a duplicate domain error
- Use `301` for permanent redirects (browsers and search engines cache them). Use `302` if the redirect may change
- TLS for the source domain follows the same auto-provisioning logic as proxy routes when `tlsEnabled: true`
