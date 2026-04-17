import { desc, gte } from 'drizzle-orm'
import { getDb, accessLog, trafficMetrics } from '@proxyos/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const tick = async () => {
        const db = getDb()
        const since = new Date(Date.now() - 60_000)

        const logs = await db
          .select()
          .from(accessLog)
          .where(gte(accessLog.recordedAt, since))
          .orderBy(desc(accessLog.recordedAt))
          .limit(1000)

        const perSecond: Record<number, { requests: number; errors: number; latencySum: number }> = {}
        for (const l of logs) {
          const sec = Math.floor(l.recordedAt.getTime() / 1000)
          if (!perSecond[sec]) perSecond[sec] = { requests: 0, errors: 0, latencySum: 0 }
          perSecond[sec].requests++
          if (l.statusCode && l.statusCode >= 500) perSecond[sec].errors++
          if (l.latencyMs) perSecond[sec].latencySum += l.latencyMs
        }

        const topRoutes: Record<string, number> = {}
        for (const l of logs) {
          topRoutes[l.routeId] = (topRoutes[l.routeId] ?? 0) + 1
        }

        const topIps: Record<string, number> = {}
        for (const l of logs) {
          if (l.clientIp) topIps[l.clientIp] = (topIps[l.clientIp] ?? 0) + 1
        }

        const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }
        for (const l of logs) {
          if (!l.statusCode) continue
          if (l.statusCode < 300) statusCounts['2xx']++
          else if (l.statusCode < 400) statusCounts['3xx']++
          else if (l.statusCode < 500) statusCounts['4xx']++
          else statusCounts['5xx']++
        }

        const rpsTimeline = Object.entries(perSecond)
          .sort(([a], [b]) => Number(a) - Number(b))
          .slice(-60)
          .map(([sec, v]) => ({
            ts: Number(sec) * 1000,
            rps: v.requests,
            errRate: v.requests > 0 ? v.errors / v.requests : 0,
            avgMs: v.requests > 0 ? Math.round(v.latencySum / v.requests) : 0,
          }))

        send({
          ts: Date.now(),
          totalRequests: logs.length,
          rpsTimeline,
          topRoutes: Object.entries(topRoutes)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([routeId, count]) => ({ routeId, count })),
          topIps: Object.entries(topIps)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([ip, count]) => ({ ip, count })),
          statusCounts,
        })
      }

      await tick()
      const interval = setInterval(() => { tick().catch(() => {}) }, 1000)

      return () => clearInterval(interval)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
