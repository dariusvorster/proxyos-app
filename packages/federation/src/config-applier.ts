import type { FederationClient } from './client'
import type { ConfigApplyMessage } from './protocol'
import { getDb, routes } from '@proxyos/db'
import { eq } from 'drizzle-orm'
import { saveConfigCache } from './config-cache'

export async function applyConfig(
  client: FederationClient,
  msg: ConfigApplyMessage,
): Promise<void> {
  const { version, routes: routeConfigs } = msg.payload

  try {
    const db = getDb()
    const now = new Date()

    for (const r of routeConfigs) {
      await db
        .insert(routes)
        .values({
          id: r.id,
          name: r.host,
          domain: r.host,
          upstreamType: 'static',
          upstreams: r.upstream,
          tlsMode: r.tls_mode as 'auto' | 'dns' | 'internal' | 'custom' | 'off',
          websocketEnabled: r.websocket_enabled,
          origin: 'central',
          scope: r.scope as 'exclusive' | 'local_only',
          configVersion: version,
          tenantId: 'tenant_default',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: routes.id,
          set: {
            upstreams: r.upstream,
            tlsMode: r.tls_mode as 'auto' | 'dns' | 'internal' | 'custom' | 'off',
            websocketEnabled: r.websocket_enabled,
            configVersion: version,
            updatedAt: now,
          },
        })
    }

    if (version > 0) {
      const incomingIds = new Set(routeConfigs.map((r) => r.id))
      const existingCentral = await db
        .select({ id: routes.id })
        .from(routes)
        .where(eq(routes.origin, 'central'))
      for (const { id } of existingCentral) {
        if (!incomingIds.has(id)) {
          await db.delete(routes).where(eq(routes.id, id))
        }
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional dep; not present in all build contexts (e.g. agent)
      const { bootstrapProxyOs } = await import('@proxyos/api/bootstrap')
      const configPath = process.env.CADDY_BASE_CONFIG_PATH ?? '/app/caddy/base-config.json'
      await bootstrapProxyOs(configPath)
    } catch (e) {
      console.warn('[federation] caddy re-apply failed:', e)
    }

    const cachePath = process.env.PROXYOS_CONFIG_CACHE ?? '/data/proxyos/config-cache.json'
    saveConfigCache(cachePath, { version, routes: routeConfigs, settings: {} })
    client.setAppliedVersion(version)

    client.send({
      type: 'config.ack',
      request_id: msg.request_id,
      payload: { version, applied_at: Date.now(), success: true },
    })

    console.log(`[federation] applied config v${version}: ${routeConfigs.length} central routes`)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    client.send({
      type: 'config.ack',
      request_id: msg.request_id,
      payload: { version, applied_at: Date.now(), success: false, error },
    })
    console.error(`[federation] failed to apply config v${version}: ${error}`)
  }
}
