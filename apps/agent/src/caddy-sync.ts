import type { MsgConfigFull, MsgConfigDiff, FedRoute } from '@proxyos/federation'

const CADDY_ADMIN = process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019'

// domain → routeId mapping maintained for the log streamer
const domainToRouteId = new Map<string, string>()

export function getDomainToRouteId(): Map<string, string> {
  return domainToRouteId
}

interface CaddyRoute {
  '@id': string
  match: Array<{ host: string[] }>
  handle: unknown[]
  terminal: boolean
}

function fedRouteToCaddy(route: FedRoute): CaddyRoute {
  const handle: unknown[] = []

  if (route.ssoEnabled && route.ssoProviderId) {
    handle.push({
      handler: 'forward_auth',
      uri: route.ssoProviderId,
      copy_headers: ['Authorization', 'Remote-User', 'Remote-Groups'],
    })
  }

  if (route.compressionEnabled) {
    handle.push({ handler: 'encode', encodings: { gzip: {}, zstd: {} } })
  }

  handle.push({
    handler: 'reverse_proxy',
    upstreams: (JSON.parse(route.upstreams) as Array<{ address: string }>).map(u => ({ dial: u.address })),
    health_checks: route.healthCheckEnabled
      ? { active: { path: route.healthCheckPath, interval: `${route.healthCheckInterval}s`, timeout: '5s' } }
      : undefined,
  })

  return {
    '@id': `proxyos_${route.id}`,
    match: [{ host: [route.domain] }],
    handle,
    terminal: true,
  }
}

async function caddyRequest(method: string, path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${CADDY_ADMIN}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Caddy ${method} ${path} → ${res.status}: ${text}`)
  }
}

export async function applyFullConfig(msg: MsgConfigFull): Promise<void> {
  const activeRoutes = msg.routes.filter(r => r.enabled)
  const caddyRoutes = activeRoutes.map(fedRouteToCaddy)

  await caddyRequest('POST', '/config/apps/http/servers/proxyos/routes', caddyRoutes)

  // Rebuild domain→routeId map
  domainToRouteId.clear()
  for (const route of activeRoutes) domainToRouteId.set(route.domain, route.id)

  console.log(`[agent] Full config applied: ${caddyRoutes.length} routes`)
}

export async function applyDiff(msg: MsgConfigDiff): Promise<void> {
  for (const route of msg.added.filter(r => r.enabled)) {
    await caddyRequest('POST', '/config/apps/http/servers/proxyos/routes', [fedRouteToCaddy(route)])
  }
  for (const route of msg.updated) {
    const path = `/id/proxyos_${route.id}`
    if (route.enabled) {
      await caddyRequest('PUT', path, fedRouteToCaddy(route))
    } else {
      await caddyRequest('DELETE', path).catch(() => { /* may not exist */ })
    }
  }
  for (const id of msg.removed) {
    await caddyRequest('DELETE', `/id/proxyos_${id}`).catch(() => { /* already gone */ })
    // Remove from domain map by value
    for (const [domain, routeId] of domainToRouteId) {
      if (routeId === id) { domainToRouteId.delete(domain); break }
    }
  }
  // Update map for added/updated
  for (const route of msg.added) domainToRouteId.set(route.domain, route.id)
  for (const route of msg.updated) domainToRouteId.set(route.domain, route.id)

  console.log(`[agent] Diff applied: +${msg.added.length} ~${msg.updated.length} -${msg.removed.length}`)
}
