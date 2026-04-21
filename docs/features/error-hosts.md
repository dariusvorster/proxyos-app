# Error Hosts

> An error host serves a static error page or redirect for a domain, with no upstream proxying.

## What it does

An error host creates a Caddy route that responds to all requests with a configurable HTTP status code and body. It can show the default ProxyOS error template, custom HTML, or perform a redirect. No upstream is involved.

Error hosts are stored in the `error_hosts` table, separate from proxy routes.

## When to use it

- Take a service offline gracefully with a custom maintenance page
- Park a domain with a 404 or 503 page while a new service is being set up
- Reserve a domain that should never serve content (`403 Forbidden`)
- Replace a decommissioned service with a redirect to its replacement

## How to configure

Navigate to **Hosts → Error Hosts → New Error Host**:

| Field | Default | Description |
|---|---|---|
| Domain | — | The hostname to handle |
| Status code | `404` | HTTP status code to return |
| Page type | `default` | `default`, `custom_html`, or `redirect` |
| Custom HTML | — | HTML body (when `page_type = custom_html`) |
| Redirect URL | — | Destination URL (when `page_type = redirect`) |
| TLS enabled | `true` | Whether Caddy handles HTTPS for the domain |

### Page types

**`default`** — Returns a minimal HTML page that says "This service is not available" with the status code. Includes a "Powered by ProxyOS" footer.

**`custom_html`** — Returns whatever HTML you provide. Full control over the error page appearance.

**`redirect`** — Returns a `301` redirect to the configured URL, regardless of the status code field. Use this to point a domain to its replacement permanently.

## Troubleshooting

- Duplicate domain: a proxy route, redirect host, or another error host already uses this domain
- Custom HTML not rendering: ensure the HTML is valid and starts with `<!DOCTYPE html>` if you need browser rendering
- TLS for error hosts provisions automatically the same way as proxy routes
