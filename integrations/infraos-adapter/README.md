# ProxyOS → InfraOS Adapter

Standalone integration adapter that pulls ProxyOS route, certificate, and analytics data into InfraOS's topology graph.

## Where this file goes

Copy `proxyos-adapter.ts` into the InfraOS monorepo:

```
infraos/packages/integrations/proxyos.ts
```

Then register it in the InfraOS integration registry (wherever Proxmox, Cloudflare, and Authentik adapters are registered).

## Prerequisites

1. A running ProxyOS instance (v0.2.0+)
2. A ProxyOS API token with the following scopes:
   - `health:read`
   - `routes:read`
   - `certs:read`
   - `analytics:read`

## Creating the API token

In ProxyOS, go to **Settings → API Keys** and create a token with the four read scopes above. The token is shown once on creation (`pxos_...`).

## Usage

```typescript
import { ProxyOSAdapter } from './proxyos'

const adapter = new ProxyOSAdapter({
  baseUrl: 'https://proxy.home.lab',
  apiToken: 'pxos_your_token_here',
  analyticsWindowMinutes: 60, // optional, default 60
})

// Test connectivity
const { ok, message } = await adapter.test()

// Sync into InfraOS topology
const result = await adapter.sync()
// result.services    → one per ProxyOS route
// result.tunnelRoutes → active routes as ingress entries
// result.ssoProviders → SSO-enabled routes
```

## Data mapping

| ProxyOS concept | InfraOS concept |
|---|---|
| Route | `ServiceData` — domain, upstreams, TLS mode, health |
| Enabled route | `TunnelRouteData` — domain → upstream URL |
| SSO-enabled route | `SSOProviderData` — forward-auth entry |
| Certificate | embedded in `ServiceData.meta.certStatus` / `certExpiresAt` |
| Analytics (1h) | embedded in `ServiceData.meta.requests1h`, `errorRatePct`, etc. |

## Removing the type stubs

The top of `proxyos-adapter.ts` re-declares the InfraOS `IntegrationAdapter` interface and related types so the file compiles standalone. Once it lives inside the InfraOS monorepo, delete that block and replace with:

```typescript
import type { IntegrationAdapter, SyncResult, ServiceData, TunnelRouteData, SSOProviderData } from '../types'
```

## API surface used

All requests go to `/api/trpc/publicApi.*` with `Authorization: Bearer pxos_...`:

| Endpoint | Scope | Used for |
|---|---|---|
| `publicApi.health` | `health:read` | Connectivity test |
| `publicApi.routes` | `routes:read` | Service + tunnel topology |
| `publicApi.certs` | `certs:read` | Cert status on services |
| `publicApi.analytics` | `analytics:read` | Traffic metrics on services |
