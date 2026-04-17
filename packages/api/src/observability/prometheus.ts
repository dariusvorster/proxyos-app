import { gte } from 'drizzle-orm'
import type { Db } from '@proxyos/db'
import { agents, certificates, connections, routes, trafficMetrics } from '@proxyos/db'

export async function renderPrometheusMetrics(db: Db): Promise<string> {
  const lines: string[] = []
  const now = Date.now()
  const fiveMinAgo = now - 5 * 60 * 1000

  const [routeRows, allMetricRows, recentMetricRows, agentRows, certRows, connRows] = await Promise.all([
    db.select().from(routes).all(),
    // All rows ever — used for cumulative counters (monotonically increasing)
    db.select().from(trafficMetrics).all(),
    // Recent rows — used for gauges (latency) which need a current snapshot
    db.select().from(trafficMetrics).where(gte(trafficMetrics.bucketTs, fiveMinAgo)).all(),
    db.select().from(agents).all(),
    db.select().from(certificates).all(),
    db.select().from(connections).all(),
  ])

  type RouteAgg = { requests: number; status2xx: number; status4xx: number; status5xx: number; latencySum: number; bytes: number }

  // Cumulative aggregation — all time
  const byRouteAll = new Map<string, RouteAgg>()
  for (const r of allMetricRows) {
    const cur = byRouteAll.get(r.routeId) ?? { requests: 0, status2xx: 0, status4xx: 0, status5xx: 0, latencySum: 0, bytes: 0 }
    cur.requests += r.requests
    cur.status2xx += r.status2xx
    cur.status4xx += r.status4xx
    cur.status5xx += r.status5xx
    cur.latencySum += r.latencySumMs
    cur.bytes += r.bytes
    byRouteAll.set(r.routeId, cur)
  }

  // Rolling 5-minute aggregation — for latency gauge only
  const byRouteRecent = new Map<string, RouteAgg>()
  for (const r of recentMetricRows) {
    const cur = byRouteRecent.get(r.routeId) ?? { requests: 0, status2xx: 0, status4xx: 0, status5xx: 0, latencySum: 0, bytes: 0 }
    cur.requests += r.requests
    cur.latencySum += r.latencySumMs
    byRouteRecent.set(r.routeId, cur)
  }

  const domainOf = new Map(routeRows.map(r => [r.id, r.domain]))

  // Counters — cumulative (never reset unless DB is wiped)
  lines.push('# HELP proxyos_route_requests_total Total HTTP requests per route and status class')
  lines.push('# TYPE proxyos_route_requests_total counter')
  for (const [routeId, agg] of byRouteAll) {
    const d = domainOf.get(routeId) ?? routeId
    for (const [status, val] of [['2xx', agg.status2xx], ['4xx', agg.status4xx], ['5xx', agg.status5xx]] as [string, number][]) {
      lines.push(`proxyos_route_requests_total{route="${d}",status="${status}"} ${val}`)
    }
  }

  lines.push('# HELP proxyos_route_bytes_total Total bytes transferred per route')
  lines.push('# TYPE proxyos_route_bytes_total counter')
  for (const [routeId, agg] of byRouteAll) {
    const d = domainOf.get(routeId) ?? routeId
    lines.push(`proxyos_route_bytes_total{route="${d}"} ${agg.bytes}`)
  }

  // Gauge — rolling 5-minute average latency
  lines.push('# HELP proxyos_route_request_duration_seconds Average request duration in seconds (5-min window)')
  lines.push('# TYPE proxyos_route_request_duration_seconds gauge')
  for (const [routeId, agg] of byRouteRecent) {
    const d = domainOf.get(routeId) ?? routeId
    const avgSec = agg.requests > 0 ? (agg.latencySum / agg.requests / 1000).toFixed(4) : '0.0000'
    lines.push(`proxyos_route_request_duration_seconds{route="${d}",quantile="0.95"} ${avgSec}`)
  }

  lines.push('# HELP proxyos_route_upstream_health Route enabled/healthy (1=yes, 0=no)')
  lines.push('# TYPE proxyos_route_upstream_health gauge')
  for (const r of routeRows) {
    lines.push(`proxyos_route_upstream_health{route="${r.domain}"} ${r.enabled ? 1 : 0}`)
  }

  lines.push('# HELP proxyos_agent_status Agent heartbeat status (1=online, 0=offline)')
  lines.push('# TYPE proxyos_agent_status gauge')
  for (const a of agentRows) {
    lines.push(`proxyos_agent_status{agent="${a.name}"} ${a.status === 'online' ? 1 : 0}`)
  }
  lines.push('# HELP proxyos_agent_routes_total Number of routes per agent')
  lines.push('# TYPE proxyos_agent_routes_total gauge')
  for (const a of agentRows) {
    lines.push(`proxyos_agent_routes_total{agent="${a.name}"} ${a.routeCount}`)
  }

  lines.push('# HELP proxyos_cert_expiry_days Days until certificate expires')
  lines.push('# TYPE proxyos_cert_expiry_days gauge')
  for (const c of certRows) {
    if (c.expiresAt) {
      const days = Math.floor((new Date(c.expiresAt).getTime() - now) / 86_400_000)
      lines.push(`proxyos_cert_expiry_days{domain="${c.domain}"} ${days}`)
    }
  }

  lines.push('# HELP proxyos_connection_status Connection health (1=connected, 0=disconnected)')
  lines.push('# TYPE proxyos_connection_status gauge')
  for (const c of connRows) {
    lines.push(`proxyos_connection_status{connection="${c.name}",type="${c.type}"} ${c.status === 'connected' ? 1 : 0}`)
  }

  return lines.join('\n') + '\n'
}
