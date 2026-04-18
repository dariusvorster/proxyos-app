'use client'

import { Topbar, PageContent } from '~/components/shell'
import { Card, Badge, DataTable, td, th } from '~/components/ui'
import { trpc } from '~/lib/trpc'

function heatColor(requests: number, max: number): string {
  if (max === 0) return '#1a1d27'
  const pct = requests / max
  if (pct > 0.8) return '#7f1d1d'
  if (pct > 0.6) return '#991b1b'
  if (pct > 0.4) return '#b45309'
  if (pct > 0.2) return '#1e3a5f'
  return '#1a2535'
}

export default function LiveAnalyticsPage() {
  const liveMetrics = trpc.analytics.liveMetrics.useQuery(undefined, { refetchInterval: 3000 })

  const rows = liveMetrics.data ?? []
  const maxRequests = Math.max(...rows.map(r => r.requests), 1)

  return (
    <>
      <Topbar title="Live traffic heatmap" />
      <PageContent>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
          Refreshes every 3 s — showing last 60 seconds of traffic
        </div>

        {/* Heatmap grid */}
        <Card header={<span>Route activity — last 60 s</span>}>
          {rows.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '16px 0' }}>No traffic in the last 60 seconds.</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, padding: '8px 0' }}>
            {rows.sort((a, b) => b.requests - a.requests).map(row => (
              <div
                key={row.routeId}
                style={{
                  background: heatColor(row.requests, maxRequests),
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  transition: 'background 0.4s',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.domain}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{row.requests}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>req / 60s</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {row.status2xx > 0 && <Badge tone="green">{row.status2xx} 2xx</Badge>}
                  {row.status4xx > 0 && <Badge tone="amber">{row.status4xx} 4xx</Badge>}
                  {row.status5xx > 0 && <Badge tone="red">{row.status5xx} 5xx</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Table view */}
        <Card header={<span>Breakdown</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={th}>Route</th>
                <th style={{ ...th, width: '12%' }}>Req/60s</th>
                <th style={{ ...th, width: '10%' }}>2xx</th>
                <th style={{ ...th, width: '10%' }}>4xx</th>
                <th style={{ ...th, width: '10%' }}>5xx</th>
                <th style={{ ...th, width: '12%' }}>Error %</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: '20px 12px' }}>No data</td></tr>
              )}
              {rows.sort((a, b) => b.requests - a.requests).map(row => {
                const errPct = row.requests > 0 ? ((row.errors / row.requests) * 100).toFixed(1) : '0.0'
                return (
                  <tr key={row.routeId}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.domain}</td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.requests}</td>
                    <td style={{ ...td, color: 'var(--green)' }}>{row.status2xx}</td>
                    <td style={{ ...td, color: 'var(--amber)' }}>{row.status4xx}</td>
                    <td style={{ ...td, color: 'var(--red)' }}>{row.status5xx}</td>
                    <td style={td}><Badge tone={Number(errPct) > 5 ? 'red' : Number(errPct) > 1 ? 'amber' : 'green'}>{errPct}%</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}
