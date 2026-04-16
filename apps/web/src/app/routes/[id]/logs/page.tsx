'use client'

import { use } from 'react'
import Link from 'next/link'
import { Badge, Card, DataTable, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function RouteLogsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const routes = trpc.routes.list.useQuery()
  const logs = trpc.analytics.accessLog.useQuery({ routeId: id, limit: 200 }, { refetchInterval: 3000 })
  const route = routes.data?.find((r) => r.id === id)

  return (
    <>
      <Topbar
        title={`Logs — ${route?.domain ?? id}`}
        actions={<Link href={`/routes/${id}`} style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Route detail</Link>}
      />
      <PageContent>
        <Card header={<><span>Access log (live tail)</span><span style={{ color: 'var(--text-dim)' }}>{logs.data?.length ?? 0} entries</span></>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '14%' }}>Time</th>
                <th style={{ ...th, width: '7%' }}>Method</th>
                <th style={{ ...th, width: '32%' }}>Path</th>
                <th style={{ ...th, width: '8%' }}>Status</th>
                <th style={{ ...th, width: '9%' }}>Latency</th>
                <th style={{ ...th, width: '10%' }}>Bytes</th>
                <th style={{ ...th, width: '12%' }}>Client</th>
                <th style={{ ...th, width: '8%' }}>UA</th>
              </tr>
            </thead>
            <tbody>
              {logs.data?.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No requests recorded yet.</td></tr>
              )}
              {logs.data?.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{new Date(r.recordedAt).toLocaleTimeString()}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{r.method}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--pu-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path}</td>
                  <td style={td}><Badge tone={statusTone(r.statusCode ?? 0)}>{r.statusCode}</Badge></td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.latencyMs}ms</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', fontSize: 10 }}>{r.bytesOut ?? 0}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{r.clientIp}</td>
                  <td style={{ ...td, color: 'var(--text-ghost)', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(r.userAgent ?? '').slice(0, 20)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}

function statusTone(code: number): 'green' | 'amber' | 'red' | 'neutral' {
  if (code >= 500) return 'red'
  if (code >= 400) return 'amber'
  if (code >= 300) return 'neutral'
  return 'green'
}
