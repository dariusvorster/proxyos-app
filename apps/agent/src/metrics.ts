import type { MsgMetricsPush } from '@proxyos/federation'
import { METRICS_PUSH_INTERVAL_MS } from '@proxyos/federation'

interface RouteMetric {
  reqPerMin: number
  errorRate: number
  p95LatencyMs: number
  bytesIn: number
  bytesOut: number
}

// Simple in-memory accumulator — reset each push interval
let accum: Record<string, RouteMetric> = {}
let startTime = Date.now()

export function recordRequest(routeId: string, latencyMs: number, statusCode: number, bytesIn: number, bytesOut: number): void {
  if (!accum[routeId]) {
    accum[routeId] = { reqPerMin: 0, errorRate: 0, p95LatencyMs: 0, bytesIn: 0, bytesOut: 0 }
  }
  const m = accum[routeId]!
  m.reqPerMin += 1
  if (statusCode >= 500) m.errorRate = (m.errorRate * (m.reqPerMin - 1) + 1) / m.reqPerMin
  m.p95LatencyMs = Math.max(m.p95LatencyMs, latencyMs)
  m.bytesIn += bytesIn
  m.bytesOut += bytesOut
}

export function buildMetricsMsg(agentId: string, caddyVersion: string): MsgMetricsPush {
  const elapsedMin = (Date.now() - startTime) / 60_000
  const routes: MsgMetricsPush['routes'] = {}

  for (const [routeId, m] of Object.entries(accum)) {
    routes[routeId] = {
      reqPerMin: m.reqPerMin / Math.max(elapsedMin, 1),
      errorRate: m.errorRate,
      p95LatencyMs: m.p95LatencyMs,
      bytesIn: m.bytesIn,
      bytesOut: m.bytesOut,
    }
  }

  // Reset accumulator
  accum = {}
  startTime = Date.now()

  return {
    type: 'metrics.push',
    agentId,
    timestamp: Date.now(),
    routes,
    system: {
      caddyStatus: 'running',
      caddyVersion,
      uptimeSeconds: Math.floor(process.uptime()),
    },
  }
}

export { METRICS_PUSH_INTERVAL_MS }
