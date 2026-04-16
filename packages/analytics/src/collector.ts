import { closeSync, createReadStream, openSync, statSync, watch } from 'fs'
import { createInterface } from 'readline'
import { eq, and } from 'drizzle-orm'
import { accessLog, getDb, nanoid, routes, trafficMetrics } from '@proxyos/db'
import type { CaddyLogEntry } from './types'

const ACCESS_LOG_RING_SIZE = 1000

export interface CollectorOptions {
  logPath: string
  bucketSizeMs?: number
}

export async function startCollector(opts: CollectorOptions): Promise<{ stop: () => void }> {
  const bucketSizeMs = opts.bucketSizeMs ?? 60_000
  const db = getDb()
  const domainToRouteId = new Map<string, string>()

  async function refreshDomainMap() {
    const rows = await db.select({ id: routes.id, domain: routes.domain }).from(routes)
    domainToRouteId.clear()
    for (const r of rows) domainToRouteId.set(r.domain, r.id)
  }
  await refreshDomainMap()
  const refreshTimer = setInterval(refreshDomainMap, 10_000)

  try {
    statSync(opts.logPath)
  } catch {
    closeSync(openSync(opts.logPath, 'a'))
  }
  let offset = 0
  try {
    offset = statSync(opts.logPath).size
  } catch {
    offset = 0
  }

  let reading = false
  async function drain() {
    if (reading) return
    reading = true
    try {
      let size = 0
      try {
        size = statSync(opts.logPath).size
      } catch {
        reading = false
        return
      }
      if (size < offset) offset = 0
      if (size === offset) return
      const stream = createReadStream(opts.logPath, { start: offset, end: size - 1, encoding: 'utf8' })
      const rl = createInterface({ input: stream })
      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line) as CaddyLogEntry
          await processEntry(entry, domainToRouteId, bucketSizeMs)
        } catch {
          /* skip malformed */
        }
      }
      offset = size
    } finally {
      reading = false
    }
  }

  await drain()
  const watcher = watch(opts.logPath, { persistent: false }, () => void drain())
  const pollTimer = setInterval(drain, 2000)

  return {
    stop: () => {
      clearInterval(refreshTimer)
      clearInterval(pollTimer)
      watcher.close()
    },
  }
}

async function processEntry(
  entry: CaddyLogEntry,
  domainToRouteId: Map<string, string>,
  bucketSizeMs: number,
): Promise<void> {
  const host = entry.request?.host
  if (!host) return
  const routeId = domainToRouteId.get(host) ?? domainToRouteId.get(host.split(':')[0] ?? '')
  if (!routeId) return

  const status = entry.status ?? 0
  const db = getDb()
  const recordedAt = new Date((entry.ts ?? Date.now() / 1000) * 1000)
  const latencyMs = Math.round((entry.duration ?? 0) * 1000)

  await db.insert(accessLog).values({
    id: nanoid(),
    routeId,
    method: entry.request?.method,
    path: entry.request?.uri,
    statusCode: status,
    latencyMs,
    bytesOut: entry.size ?? 0,
    clientIp: entry.request?.remote_ip,
    userAgent: entry.request?.headers?.['User-Agent']?.[0],
    recordedAt,
  })

  await trimAccessLog(routeId)

  const bucketTs = Math.floor(recordedAt.getTime() / bucketSizeMs) * bucketSizeMs
  const existing = await db
    .select()
    .from(trafficMetrics)
    .where(and(eq(trafficMetrics.routeId, routeId), eq(trafficMetrics.bucket, '1m'), eq(trafficMetrics.bucketTs, bucketTs)))
    .get()

  const statusBucket = `status${Math.floor(status / 100)}xx` as 'status2xx' | 'status3xx' | 'status4xx' | 'status5xx'
  const isError = status >= 500

  if (existing) {
    await db
      .update(trafficMetrics)
      .set({
        requests: existing.requests + 1,
        bytes: existing.bytes + (entry.size ?? 0),
        errors: existing.errors + (isError ? 1 : 0),
        latencySumMs: existing.latencySumMs + latencyMs,
        status2xx: existing.status2xx + (statusBucket === 'status2xx' ? 1 : 0),
        status3xx: existing.status3xx + (statusBucket === 'status3xx' ? 1 : 0),
        status4xx: existing.status4xx + (statusBucket === 'status4xx' ? 1 : 0),
        status5xx: existing.status5xx + (statusBucket === 'status5xx' ? 1 : 0),
      })
      .where(eq(trafficMetrics.id, existing.id))
  } else {
    await db.insert(trafficMetrics).values({
      id: nanoid(),
      routeId,
      bucket: '1m',
      bucketTs,
      requests: 1,
      bytes: entry.size ?? 0,
      errors: isError ? 1 : 0,
      latencySumMs: latencyMs,
      status2xx: statusBucket === 'status2xx' ? 1 : 0,
      status3xx: statusBucket === 'status3xx' ? 1 : 0,
      status4xx: statusBucket === 'status4xx' ? 1 : 0,
      status5xx: statusBucket === 'status5xx' ? 1 : 0,
    })
  }
}

async function trimAccessLog(routeId: string): Promise<void> {
  const db = getDb()
  const rows = await db
    .select({ id: accessLog.id, recordedAt: accessLog.recordedAt })
    .from(accessLog)
    .where(eq(accessLog.routeId, routeId))
  if (rows.length <= ACCESS_LOG_RING_SIZE) return
  rows.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
  const toDelete = rows.slice(0, rows.length - ACCESS_LOG_RING_SIZE)
  for (const row of toDelete) {
    await db.delete(accessLog).where(eq(accessLog.id, row.id))
  }
}
