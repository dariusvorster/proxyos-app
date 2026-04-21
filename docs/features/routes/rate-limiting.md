# Rate Limiting

> Rate limiting restricts how many requests a client can make to a route within a time window.

## What it does

ProxyOS adds a Caddy `rate_limit` handler when rate limiting is enabled on a route. Requests that exceed the configured limit receive a `429 Too Many Requests` response. The handler operates per-zone, keyed by a configurable identifier (default: client IP).

## When to use it

Enable rate limiting on:
- Public-facing login or API endpoints to prevent brute-force attacks
- Routes exposed to the internet where you want to limit scraping or abuse
- Routes with expensive upstream operations where you need to cap concurrency

## How to configure

Edit a route and configure the **Rate Limiting** section:

| Setting | Description |
|---|---|
| Requests | Maximum number of requests allowed per window |
| Window | Time window (e.g. `1m`, `10s`, `1h`) — Caddy duration format |
| Key | What to key the rate limit on (default: `{remote_host}`) |

### Key options

| Key | Description |
|---|---|
| `{remote_host}` | Client IP (default) — rate limit per IP |
| `{http.request.header.X-API-Key}` | Rate limit per API key header |
| `{http.request.uri.path}` | Rate limit per path |

Caddy placeholders can be used in the `key` field.

## Troubleshooting

- If all clients are being rate limited together, the key may be resolving to the same value (e.g., all traffic is seen as coming from a single proxy IP). Ensure `trusted_proxies` is configured so `{remote_host}` resolves to the real client IP.
- Rate limiting state is in-memory and resets on container restart. For persistent rate limiting across restarts, consider an upstream application-level approach.
