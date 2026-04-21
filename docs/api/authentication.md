# API Authentication

> The ProxyOS API is a tRPC v11 API. Authentication uses session cookies for dashboard users or API keys for programmatic access.

## What it does

ProxyOS exposes a tRPC API at `/api/trpc/[procedure]`. All procedures are authenticated. Two authentication methods are supported:

1. **Session cookie** — used by the dashboard UI (browser-based)
2. **API key** — used for programmatic access and automation

## Session cookie authentication

When you log in through the dashboard, a session cookie is set. The cookie is:
- HTTP-only (not accessible via JavaScript)
- `Secure` in production (requires HTTPS)
- `SameSite` scoped to prevent cross-site request forgery

The session is managed by `better-auth`. Sessions expire according to the configured session lifetime.

## API key authentication

API keys are created in **Settings → API Keys**. Each key has:
- A name (human-readable label)
- A set of scopes (what the key is allowed to do)
- An optional expiry date

### Creating an API key

1. Go to **Settings → API Keys → New API Key**
2. Enter a name and select scopes
3. Copy the key — it is shown only once

The key is stored as a hash in the `api_keys` table. The plaintext is never stored.

### Using an API key

Pass the API key in the `Authorization` header:

```bash
curl -H "Authorization: Bearer your-api-key" \
  https://proxyos.yourdomain.com/api/trpc/routes.list
```

Or as a query parameter (less secure — avoid in URLs that may be logged):

```bash
curl "https://proxyos.yourdomain.com/api/trpc/routes.list?apiKey=your-api-key"
```

## tRPC endpoint format

tRPC procedures are called via HTTP:

```
GET  /api/trpc/[router].[procedure]?input=<JSON>   (queries)
POST /api/trpc/[router].[procedure]                 (mutations, body is JSON input)
```

Batch calls are supported via the tRPC batch link.

## Troubleshooting

- **401 on all requests**: Session expired or cookie not sent — log in again or check API key
- **API key not working**: Verify the key is active and has not expired (`Settings → API Keys`)
- **CORS errors on API requests from external origins**: The API is not designed for cross-origin browser requests. Use server-side calls with an API key instead.

## Related

- [Scopes and Permissions](scopes-and-permissions.md)
- [Routes Endpoints](routes-endpoints.md)
