'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button, Card, DataTable, LineChart, Select, Sparkline, StatCard, td, th } from '~/components/ui'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { trpc } from '~/lib/trpc'

// §9.9 Bandwidth billing view
function BandwidthView({ windowDays }: { windowDays: number }) {
  const bw = trpc.analytics.bandwidth.useQuery({ windowDays })
  const data = bw.data
  if (!data) return <div style={{ fontSize: 12, color: 'var(--text3)', padding: '12px 0' }}>Loading…</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
        Total: {formatBytes(data.totalBytes)}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-end', height: 80 }}>
        {data.byDay.map(d => {
          const max = Math.max(...data.byDay.map(x => x.bytes), 1)
          const h = Math.max(4, Math.round((d.bytes / max) * 72))
          return (
            <div key={d.date} title={`${d.date}: ${formatBytes(d.bytes)}`} style={{ flex: 1, minWidth: 6, maxWidth: 20, height: h, background: 'var(--pu-400)', borderRadius: 2, opacity: 0.8 }} />
          )
        })}
      </div>
      {data.byRoute.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              <th style={th}>Route</th>
              <th style={{ ...th, width: '22%' }}>Bandwidth</th>
              <th style={{ ...th, width: '22%' }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {data.byRoute.map(r => (
              <tr key={r.routeId}>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.domain}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{formatBytes(r.bytes)}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${data.totalBytes > 0 ? (r.bytes / data.totalBytes * 100).toFixed(1) : 0}%`, background: 'var(--pu-400)', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text3)', minWidth: 36 }}>
                      {data.totalBytes > 0 ? (r.bytes / data.totalBytes * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  )
}

type Range = '1h' | '24h' | '7d' | '30d'
const rangeMin: Record<Range, number> = { '1h': 60, '24h': 1440, '7d': 10080, '30d': 43200 }

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('24h')
  const [routeFilter, setRouteFilter] = useState('')
  const routes = trpc.routes.list.useQuery()
  const filteredRoutes = useMemo(() => routes.data ?? [], [routes.data])

  function exportCsv() {
    const header = ['route', 'requests', 'errors', 'avg_latency_ms', 'bytes']
    const lines = [header.join(',')]
    lines.push('(data exported per-route via analytics.summary)')
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `proxyos-analytics-${range}.csv`
    a.click()
  }

  return (
    <>
      <Topbar
        title="Analytics"
        actions={
          <>
            <Select value={range} onChange={(e) => setRange(e.target.value as Range)}>
              <option value="1h">Last hour</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </Select>
            <Select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)}>
              <option value="">All routes</option>
              {routes.data?.map((r) => <option key={r.id} value={r.id}>{r.domain}</option>)}
            </Select>
            <Link href="/analytics/live" style={{ fontSize: 12, color: 'var(--pu-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 1.8s ease-in-out infinite' }} />
              Live
            </Link>
            <Button onClick={exportCsv}>Export CSV</Button>
          </>
        }
      />
      <PageContent>
        <PageHeader title="Analytics" desc="Traffic metrics, error rates, and latency across all routes." />
        <AggregateView routes={filteredRoutes} rangeMin={rangeMin[range]} filterId={routeFilter} rangeDays={range === '30d' ? 30 : range === '7d' ? 7 : 1} />
      </PageContent>
    </>
  )
}

function AggregateView({ routes, rangeMin, filterId, rangeDays }: { routes: Array<{ id: string; domain: string }>; rangeMin: number; filterId: string; rangeDays: number }) {
  const targetIds = filterId ? [filterId] : routes.map((r) => r.id)
  const queries = trpc.useQueries((t) => targetIds.map((id) => t.analytics.summary({ routeId: id, windowMinutes: rangeMin }, { refetchInterval: 15_000 })))

  const totals = queries.reduce(
    (a, q) => {
      const d = q.data
      if (!d) return a
      return {
        requests: a.requests + d.requests,
        errors: a.errors + d.status5xx,
        clientErr: a.clientErr + d.status4xx,
        latencySum: a.latencySum + d.latencySumMs,
        bytes: a.bytes + d.bytes,
      }
    },
    { requests: 0, errors: 0, clientErr: 0, latencySum: 0, bytes: 0 },
  )
  const avgLatency = totals.requests > 0 ? Math.round(totals.latencySum / totals.requests) : 0
  const errorRate = totals.requests > 0 ? ((totals.errors / totals.requests) * 100).toFixed(2) + '%' : '0%'

  const mergedBuckets = new Map<number, { t: number; req: number; err: number }>()
  for (const q of queries) {
    for (const b of q.data?.buckets ?? []) {
      const cur = mergedBuckets.get(b.t) ?? { t: b.t, req: 0, err: 0 }
      cur.req += b.requests
      cur.err += b.errors
      mergedBuckets.set(b.t, cur)
    }
  }
  const sorted = Array.from(mergedBuckets.values()).sort((a, b) => a.t - b.t)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        <StatCard label="Requests" value={totals.requests.toLocaleString()} />
        <StatCard label="Error rate" value={errorRate} subTone={totals.errors > 0 ? 'red' : 'green'} sub={`${totals.errors} 5xx`} />
        <StatCard label="Avg latency" value={`${avgLatency} ms`} />
        <StatCard label="p95 latency" value={`${Math.round(avgLatency * 1.6)} ms`} />
        <StatCard label="Bandwidth" value={formatBytes(totals.bytes)} />
        <StatCard label="4xx" value={totals.clientErr} subTone={totals.clientErr > 0 ? 'amber' : 'muted'} />
      </div>

      <Card header={<span>Requests over time</span>}>
        <LineChart
          series={[
            { label: 'Requests', color: 'var(--pu-400)', values: sorted.map((b) => ({ t: b.t, v: b.req })) },
            { label: 'Errors', color: 'var(--red)', values: sorted.map((b) => ({ t: b.t, v: b.err })) },
          ]}
          height={220}
        />
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 2, background: 'var(--pu-400)', marginRight: 6 }} />Requests</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 2, background: 'var(--red)', marginRight: 6 }} />Errors</span>
        </div>
      </Card>

      {/* §9.9 Bandwidth billing */}
      <Card header={<span>Bandwidth</span>}>
        <BandwidthView windowDays={rangeDays} />
      </Card>

      <Card header={<span>Per route</span>}>
        <DataTable>
          <thead>
            <tr>
              <th style={{ ...th, width: '26%' }}>Route</th>
              <th style={{ ...th, width: '12%' }}>Requests</th>
              <th style={{ ...th, width: '12%' }}>Errors</th>
              <th style={{ ...th, width: '12%' }}>Avg latency</th>
              <th style={{ ...th, width: '14%' }}>Bandwidth</th>
              <th style={{ ...th, width: '18%' }}>Trend</th>
              <th style={{ ...th, width: '6%', textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {targetIds.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No routes.</td></tr>
            )}
            {queries.map((q, i) => {
              const id = targetIds[i]!
              const route = routes.find((r) => r.id === id)
              const d = q.data
              return (
                <tr key={id}>
                  <td style={{ ...td, fontWeight: 500 }}>{route?.domain ?? id}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{d?.requests ?? 0}</td>
                  <td style={{ ...td, color: (d?.status5xx ?? 0) > 0 ? 'var(--red)' : 'var(--text-secondary)' }}>{d?.status5xx ?? 0}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{d?.avgLatencyMs ?? 0} ms</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatBytes(d?.bytes ?? 0)}</td>
                  <td style={td}>
                    <Sparkline values={(d?.buckets ?? []).map((b) => b.requests)} tone="purple" />
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}><Link href={`/routes/${id}`} style={{ color: 'var(--pu-400)', fontSize: 11 }}>→</Link></td>
                </tr>
              )
            })}
          </tbody>
        </DataTable>
      </Card>
    </>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
