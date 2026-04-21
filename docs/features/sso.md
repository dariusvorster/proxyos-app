# SSO / Forward Auth

> SSO (forward auth) delegates authentication for a route to an external auth provider before forwarding the request to the upstream.

## What it does

When SSO is enabled on a route, ProxyOS adds a Caddy `forward_auth` handler before the reverse proxy handler. For every incoming request, Caddy makes a sub-request to the SSO provider's forward auth URL. If the provider returns 2xx, the request proceeds. If it returns 4xx or 5xx, the user is redirected to the provider's login page.

Response headers from the auth provider can be forwarded to the upstream (e.g., `X-Auth-User`, `X-Auth-Email`).

SSO providers are configured in Settings → SSO Providers and stored in the `sso_providers` table.

## When to use it

Enable SSO on routes where:
- You want a single sign-on experience across multiple services
- The upstream service has no authentication of its own
- You want to gate access behind an identity provider (Authelia, Authentik, Keycloak, etc.)

## How to configure

### 1. Add an SSO provider

Go to **Settings → SSO Providers → New Provider**:

| Field | Description |
|---|---|
| Name | Label for this provider |
| Type | Provider type (e.g., `authelia`, `authentik`, `generic`) |
| Forward Auth URL | The URL Caddy calls to verify authentication |
| Auth response headers | Headers to copy from the auth response to the upstream request |

### 2. Enable SSO on a route

Edit a route and enable **SSO**. Select the provider from the dropdown.

### Accessos integration

For AccessOS-based group-level authorization, configure `accessosGroups` on the route and link an AccessOS provider. This restricts access to users who belong to the specified groups in the AccessOS directory.

## Troubleshooting

- **Redirect loop**: The auth provider's own domain should NOT have SSO enabled (circular dependency)
- **Auth response headers not forwarded**: Verify the header names listed in `authResponseHeaders` exactly match what the provider sends
- **SSO provider test fails**: Check the forward auth URL is reachable from inside the ProxyOS container — test with `wget` from `docker compose exec proxyos`
