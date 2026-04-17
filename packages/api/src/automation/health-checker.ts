import { desc, eq } from 'drizzle-orm'
import { getDb, healthChecks, nanoid, routes } from '@proxyos/db'

const INTERVAL_MS = 60_000

async function runChecks(): Promise<void> {
  const db = getDb()
  const allRoutes = await db
    .select()
    .from(routes)
    .where(eq(routes.healthCheckEnabled, true))

  for (const row of allRoutes) {
    if (!row.enabled || row.archivedAt) continue

    const upstreams = JSON.parse(row.upstreams) as Array<{ address: string }>
    if (!upstreams.length) continue

    const upstream = upstreams[0]!.address
    const url = upstream.startsWith('http') ? upstream : `http://${upstream}`
    const path = row.healthCheckPath ?? '/'
    const expectedCodes: number[] = row.healthCheckStatusCodes
      ? (JSON.parse(row.healthCheckStatusCodes) as number[])
      : [200, 201, 204, 301, 302]
    const bodyRegex = row.healthCheckBodyRegex ? new RegExp(row.healthCheckBodyRegex) : null
    const maxMs = row.healthCheckMaxResponseMs ?? null

    const start = performance.now()
    let statusCode: number | null = null
    let bodyMatched: boolean | null = null
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'unhealthy'
    let error: string | null = null

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch(url + path, { signal: controller.signal, redirect: 'manual' })
      statusCode = res.status
      const responseTimeMs = Math.round(performance.now() - start)

      const codeOk = expectedCodes.includes(statusCode)

      if (bodyRegex) {
        const text = await res.text()
        bodyMatched = bodyRegex.test(text)
      }

      if (!codeOk || bodyMatched === false) {
        overallStatus = 'unhealthy'
      } else if (maxMs !== null && responseTimeMs > maxMs) {
        overallStatus = 'degraded'
      } else {
        overallStatus = 'healthy'
      }

      clearTimeout(timer)

      await db.insert(healthChecks).values({
        id: nanoid(),
        routeId: row.id,
        checkedAt: new Date(),
        statusCode,
        responseTimeMs,
        bodyMatched,
        overallStatus,
        error: null,
      })
    } catch (err) {
      clearTimeout(timer)
      error = (err as Error).message
      await db.insert(healthChecks).values({
        id: nanoid(),
        routeId: row.id,
        checkedAt: new Date(),
        statusCode: null,
        responseTimeMs: Math.round(performance.now() - start),
        bodyMatched: null,
        overallStatus: 'unhealthy',
        error,
      })
    }

    // Prune to last 100 checks per route
    const checks = await db
      .select({ id: healthChecks.id })
      .from(healthChecks)
      .where(eq(healthChecks.routeId, row.id))
      .orderBy(desc(healthChecks.checkedAt))
    if (checks.length > 100) {
      for (const c of checks.slice(100)) {
        await db.delete(healthChecks).where(eq(healthChecks.id, c.id))
      }
    }
  }
}

export function startHealthChecker(): void {
  setInterval(() => { void runChecks() }, INTERVAL_MS)
  void runChecks()
}
