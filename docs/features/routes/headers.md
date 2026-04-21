# Headers

> The headers feature allows setting, deleting, or overriding HTTP request and response headers on a per-route basis.

## What it does

ProxyOS adds a Caddy `headers` handler to the route chain when header rules are configured. Request headers are modified before forwarding to the upstream; response headers are modified before returning to the client.

Additionally, ProxyOS always sets the following request headers on every route:
- `Host`: set to `{http.request.host}` (the original requested host)
- `X-Real-IP`: set to `{http.request.remote.host}` (the client IP, after trusted_proxies processing)

`X-Forwarded-*` headers are managed by Caddy natively at the server level when `trusted_proxies` is configured — they are not set per-route.

## When to use it

- Force `X-Forwarded-Proto: https` for services that generate HTTP URLs when behind a proxy
- Add security headers (`Strict-Transport-Security`, `X-Frame-Options`, `Content-Security-Policy`) to responses
- Remove headers that reveal upstream software versions
- Add custom authentication headers forwarded from SSO providers

## How to configure

Edit a route and go to the **Headers** tab. Add rules with:

| Field | Description |
|---|---|
| Direction | `request` (to upstream) or `response` (to client) |
| Operation | `set` (add/overwrite), `add` (append), `delete` |
| Header name | Case-insensitive header name |
| Value | Header value (can use Caddy placeholders like `{http.request.host}`) |

### HSTS

HSTS (`Strict-Transport-Security`) has a dedicated toggle on the route settings page. When enabled:
- TLS mode must not be `off`
- Sets `max-age=63072000` (2 years)
- Optionally adds `includeSubDomains` if **HSTS Subdomains** is also enabled

## Troubleshooting

- Mixed content errors: add `X-Forwarded-Proto: https` as a request header — see [Mixed Content Errors](../../troubleshooting/mixed-content-errors.md)
- HSTS not appearing: ensure TLS mode is not `off` (HSTS is silently skipped for HTTP-only routes)
