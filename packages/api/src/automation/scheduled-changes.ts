import { eq, and, lte } from 'drizzle-orm'
import { scheduledChanges, routes, nanoid } from '@proxyos/db'
import type { Db } from '@proxyos/db'
import { buildCaddyRoute, CaddyClient } from '@proxyos/caddy'

async function executePendingChanges(db: Db): Promise<void> {
  const now = new Date()
  const pending = await db.select().from(scheduledChanges)
    .where(and(
      eq(scheduledChanges.status, 'pending'),
      lte(scheduledChanges.scheduledAt, now),
    ))

  for (const change of pending) {
    try {
      const route = await db.select().from(routes).where(eq(routes.id, change.routeId)).get()
      if (!route) {
        await db.update(scheduledChanges).set({ status: 'failed', error: 'Route not found', executedAt: new Date() })
          .where(eq(scheduledChanges.id, change.id))
        continue
      }

      const payload = change.payload ? JSON.parse(change.payload) as Record<string, unknown> : {}

      switch (change.action) {
        case 'enable':
          await db.update(routes).set({ enabled: true, updatedAt: new Date() }).where(eq(routes.id, change.routeId))
          break
        case 'disable':
          await db.update(routes).set({ enabled: false, updatedAt: new Date() }).where(eq(routes.id, change.routeId))
          break
        case 'update_upstream': {
          const upstreams = payload.upstreams as string | undefined
          if (upstreams) {
            await db.update(routes).set({ upstreams, updatedAt: new Date() }).where(eq(routes.id, change.routeId))
          }
          break
        }
        case 'rollback': {
          // payload.configJson is the snapshot to restore
          const configJson = payload.configJson as Record<string, unknown> | undefined
          if (configJson) {
            const patch: Record<string, unknown> = { updatedAt: new Date() }
            if (configJson.upstreams) patch.upstreams = JSON.stringify(configJson.upstreams)
            if (configJson.enabled !== undefined) patch.enabled = configJson.enabled
            await db.update(routes).set(patch).where(eq(routes.id, change.routeId))
          }
          break
        }
      }

      // Sync to Caddy
      const updatedRoute = await db.select().from(routes).where(eq(routes.id, change.routeId)).get()
      if (updatedRoute) {
        try {
          const caddy = new CaddyClient()
          await caddy.updateRoute(updatedRoute.id, buildCaddyRoute({
            id: updatedRoute.id,
            name: updatedRoute.name,
            domain: updatedRoute.domain,
            enabled: updatedRoute.enabled,
            upstreamType: updatedRoute.upstreamType as 'http',
            upstreams: JSON.parse(updatedRoute.upstreams),
            lbPolicy: (updatedRoute.lbPolicy ?? 'round_robin') as 'round_robin',
            tlsMode: updatedRoute.tlsMode as 'auto',
            tlsDnsProviderId: updatedRoute.tlsDnsProviderId,
            ssoEnabled: updatedRoute.ssoEnabled,
            ssoProviderId: updatedRoute.ssoProviderId,
            healthCheckEnabled: updatedRoute.healthCheckEnabled,
            healthCheckPath: updatedRoute.healthCheckPath,
            healthCheckInterval: updatedRoute.healthCheckInterval,
            compressionEnabled: updatedRoute.compressionEnabled,
            websocketEnabled: updatedRoute.websocketEnabled,
            http2Enabled: updatedRoute.http2Enabled,
            http3Enabled: updatedRoute.http3Enabled,
            createdAt: updatedRoute.createdAt,
            updatedAt: updatedRoute.updatedAt,
            origin: (updatedRoute.origin as 'central' | 'local') ?? 'central',
            scope: (updatedRoute.scope as 'exclusive' | 'local_only') ?? 'exclusive',
          }))
        } catch {
          // Caddy sync failure doesn't block marking as done
        }
      }

      await db.update(scheduledChanges).set({ status: 'done', executedAt: new Date() })
        .where(eq(scheduledChanges.id, change.id))
    } catch (err) {
      await db.update(scheduledChanges).set({
        status: 'failed',
        error: (err as Error).message,
        executedAt: new Date(),
      }).where(eq(scheduledChanges.id, change.id))
    }
  }
}

export function startScheduledChangesWorker(db: Db): void {
  executePendingChanges(db).catch(() => {})
  setInterval(() => { executePendingChanges(db).catch(() => {}) }, 30_000)
}
