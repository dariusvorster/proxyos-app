import { and, eq, isNull } from 'drizzle-orm'
import { CaddyClient } from '@proxyos/caddy'
import { driftEvents, getDb, nanoid, routes } from '@proxyos/db'

const POLL_MS = 30_000

function caddyIdForRoute(routeId: string): string {
  return `proxyos-route-${routeId}`
}

async function poll(): Promise<void> {
  const db = getDb()
  const caddy = new CaddyClient()

  let config: unknown
  try {
    config = await caddy.getConfig()
  } catch {
    return // Caddy unreachable — skip cycle
  }

  // Extract @id values from Caddy HTTP server routes
  const servers = (config as Record<string, unknown>)?.apps as Record<string, unknown> | undefined
  const httpServers = (servers?.http as Record<string, unknown>)?.servers as Record<string, unknown> | undefined
  const caddyIds = new Set<string>()
  if (httpServers) {
    for (const srv of Object.values(httpServers)) {
      const srvRoutes = (srv as Record<string, unknown>)?.routes as unknown[] | undefined
      if (!Array.isArray(srvRoutes)) continue
      for (const r of srvRoutes) {
        const id = (r as Record<string, unknown>)?.['@id']
        if (typeof id === 'string') caddyIds.add(id)
      }
    }
  }

  const dbRoutes = await db.select({ id: routes.id, domain: routes.domain })
    .from(routes)
    .where(eq(routes.enabled, true))

  const now = new Date()

  // Routes in DB but missing from Caddy
  for (const route of dbRoutes) {
    if (!caddyIds.has(caddyIdForRoute(route.id))) {
      const existing = await db.select({ id: driftEvents.id })
        .from(driftEvents)
        .where(and(
          eq(driftEvents.type, 'missing_in_caddy'),
          eq(driftEvents.routeId, route.id),
          isNull(driftEvents.resolvedAt),
        ))
        .get()
      if (!existing) {
        await db.insert(driftEvents).values({
          id: nanoid(),
          detectedAt: now,
          type: 'missing_in_caddy',
          routeId: route.id,
          diffJson: JSON.stringify({ domain: route.domain }),
        })
      }
    }
  }

  // Routes in Caddy with our prefix but not in DB
  const dbIdSet = new Set(dbRoutes.map(r => caddyIdForRoute(r.id)))
  for (const caddyId of caddyIds) {
    if (!caddyId.startsWith('proxyos-route-')) continue
    const routeId = caddyId.slice('proxyos-route-'.length)
    if (!dbIdSet.has(caddyId)) {
      const existing = await db.select({ id: driftEvents.id })
        .from(driftEvents)
        .where(and(
          eq(driftEvents.type, 'missing_in_db'),
          eq(driftEvents.routeId, routeId),
          isNull(driftEvents.resolvedAt),
        ))
        .get()
      if (!existing) {
        await db.insert(driftEvents).values({
          id: nanoid(),
          detectedAt: now,
          type: 'missing_in_db',
          routeId,
          diffJson: JSON.stringify({ caddyId }),
        })
      }
    }
  }

  // Auto-resolve events that are now back in sync
  const unresolved = await db.select()
    .from(driftEvents)
    .where(isNull(driftEvents.resolvedAt))
  for (const event of unresolved) {
    if (!event.routeId) continue
    const inSync =
      (event.type === 'missing_in_caddy' && caddyIds.has(caddyIdForRoute(event.routeId))) ||
      (event.type === 'missing_in_db' && dbIdSet.has(caddyIdForRoute(event.routeId)))
    if (inSync) {
      await db.update(driftEvents)
        .set({ resolvedAt: now, resolution: 'auto' })
        .where(eq(driftEvents.id, event.id))
    }
  }
}

export function startDriftDetector(): void {
  setInterval(() => { void poll() }, POLL_MS)
  void poll()
}
