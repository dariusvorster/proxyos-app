# Routes API Endpoints

> tRPC procedures for managing proxy routes programmatically.

## What it does

The `routes` tRPC router exposes CRUD operations for proxy routes. All procedures require authentication (session cookie or API key with appropriate scope).

## When to use it

Use the routes API for:
- Automation scripts that create or update routes (e.g., CI/CD pipelines)
- Integration with other tools in the Homelab OS family
- Batch operations not available in the dashboard UI

## Procedures

### `routes.list`

Returns all routes. Query (GET).

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://proxyos.yourdomain.com/api/trpc/routes.list"
```

Returns an array of route objects including `id`, `name`, `domain`, `enabled`, `syncStatus`, and all configuration fields.

### `routes.get`

Returns a single route by ID. Query (GET).

```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://proxyos.yourdomain.com/api/trpc/routes.get?input=$(echo '{"id":"route-id"}' | jq -Rr @uri)"
```

### `routes.create`

Creates a new route. Mutation (POST).

```bash
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Service","domain":"app.example.com","upstreams":[{"address":"http://192.168.1.10:3000"}],"tlsMode":"auto"}' \
  "https://proxyos.yourdomain.com/api/trpc/routes.create"
```

Required fields: `name`, `domain`, `upstreams` (array with at least one `address`), `tlsMode`.

### `routes.update`

Updates an existing route. Mutation (POST).

```bash
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"route-id","upstreams":[{"address":"http://192.168.1.20:3000"}]}' \
  "https://proxyos.yourdomain.com/api/trpc/routes.update"
```

Only include fields you want to change. Other fields are preserved.

### `routes.delete`

Deletes a route and removes it from Caddy. Mutation (POST).

```bash
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"route-id"}' \
  "https://proxyos.yourdomain.com/api/trpc/routes.delete"
```

### `routes.forceResync`

Forces a re-push of a route to Caddy, resolving drift. Mutation (POST).

```bash
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"route-id"}' \
  "https://proxyos.yourdomain.com/api/trpc/routes.forceResync"
```

## Troubleshooting

- **Validation errors**: Check the response body for the specific field error
- **Route created but Sync shows drift**: Call `routes.forceResync` to re-push to Caddy
- **Domain already in use**: Another route, redirect host, or error host has the same domain
