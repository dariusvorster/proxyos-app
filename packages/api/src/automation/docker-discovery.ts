import http from 'http'
import { and, eq } from 'drizzle-orm'
import { discoveryProviders, discoveredRoutes, nanoid } from '@proxyos/db'
import type { Db } from '@proxyos/db'
import { createLogger } from '@proxyos/logger'

const logger = createLogger('[api]')

interface DockerContainer {
  Id: string
  Names: string[]
  Labels: Record<string, string>
  Ports: Array<{ PrivatePort: number; PublicPort?: number; Type: string }>
  State: string
}

function fetchContainers(socketPath: string): Promise<DockerContainer[]> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path: '/containers/json?all=false', method: 'GET' },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString()
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`[docker] GET /containers/json returned HTTP ${res.statusCode}: ${text}`))
            return
          }
          try {
            resolve(JSON.parse(text) as DockerContainer[])
          } catch (e) {
            reject(new Error(`[docker] Failed to parse container list: ${(e as Error).message}`))
          }
        })
      },
    )
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('[docker] GET /containers/json timed out')) })
    req.on('error', (err) => reject(new Error(`[docker] Failed to reach Docker socket at ${socketPath}: ${err.message}`)))
    req.end()
  })
}

async function syncDockerProvider(db: Db, providerId: string, config: { socketPath?: string; labelPrefix?: string }): Promise<void> {
  const socketPath = config.socketPath ?? '/var/run/docker.sock'
  const prefix = config.labelPrefix ?? 'proxyos'

  const containers = await fetchContainers(socketPath)
  const seenRefs = new Set<string>()

  for (const c of containers) {
    if (c.Labels[`${prefix}.enable`] !== 'true') continue

    const domain = c.Labels[`${prefix}.host`]
    const portStr = c.Labels[`${prefix}.port`]
    if (!domain || !portStr) continue

    const port = parseInt(portStr, 10)
    if (isNaN(port)) continue

    const containerName = c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12)
    const sourceRef = c.Id
    const upstreamUrl = `http://${containerName}:${port}`
    seenRefs.add(sourceRef)

    const existing = await db.select().from(discoveredRoutes)
      .where(and(eq(discoveredRoutes.providerId, providerId), eq(discoveredRoutes.sourceRef, sourceRef)))
      .get()

    const now = new Date()
    if (existing) {
      await db.update(discoveredRoutes).set({ domain, upstreamUrl, lastSeenAt: now })
        .where(eq(discoveredRoutes.id, existing.id))
    } else {
      await db.insert(discoveredRoutes).values({
        id: nanoid(),
        providerId,
        sourceRef,
        domain,
        upstreamUrl,
        templateId: c.Labels[`${prefix}.template`] ?? null,
        lastSeenAt: now,
        createdAt: now,
      })
    }
  }

  // Remove discovered routes whose containers are no longer running
  const all = await db.select().from(discoveredRoutes).where(eq(discoveredRoutes.providerId, providerId))
  const grace = 5 * 60 * 1000
  for (const dr of all) {
    if (!seenRefs.has(dr.sourceRef) && !dr.promotedRouteId) {
      const age = Date.now() - dr.lastSeenAt.getTime()
      if (age > grace) {
        await db.delete(discoveredRoutes).where(eq(discoveredRoutes.id, dr.id))
      }
    }
  }
}

export function startDockerDiscovery(db: Db): void {
  const poll = async () => {
    const providers = await db.select().from(discoveryProviders)
      .where(and(eq(discoveryProviders.type, 'docker'), eq(discoveryProviders.enabled, true)))

    for (const p of providers) {
      const config = JSON.parse(p.config) as { socketPath?: string; labelPrefix?: string }
      try {
        await syncDockerProvider(db, p.id, config)
        await db.update(discoveryProviders).set({ lastSyncAt: new Date() }).where(eq(discoveryProviders.id, p.id))
      } catch (err) {
        // Docker socket may not be available — log but don't crash the poll loop
        logger.warn({ providerId: p.id, err: err instanceof Error ? err.message : String(err) }, '[docker] discovery sync failed')
      }
    }
  }

  poll()
  const interval = 10_000 // 10s
  setInterval(() => { poll().catch(() => {}) }, interval)
}
