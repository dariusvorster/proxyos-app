'use client'

import Link from 'next/link'
import { Badge, Button, Card, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function ImportHistoryPage() {
  const sessions = trpc.importers.listSessions.useQuery()

  return (
    <>
      <Topbar title="Import history" actions={<Link href="/import"><Button variant="primary">New import</Button></Link>} />
      <PageContent>
        <Card header={<span>Past imports</span>}>
          {sessions.isLoading && <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>}
          {!sessions.isLoading && (sessions.data?.length ?? 0) === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>No imports yet.</div>
          )}
          {(sessions.data?.length ?? 0) > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Date', 'Source', 'Total', 'Imported', 'Skipped', 'Failed', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.data?.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}>{s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}</td>
                    <td style={td}><Badge tone="neutral">{s.sourceType}</Badge></td>
                    <td style={td}>{s.routeCount}</td>
                    <td style={{ ...td, color: 'var(--green)' }}>{s.imported}</td>
                    <td style={{ ...td, color: 'var(--text-dim)' }}>{s.skipped}</td>
                    <td style={{ ...td, color: s.failed > 0 ? 'var(--red)' : 'var(--text-dim)' }}>{s.failed}</td>
                    <td style={td}>
                      <Link href={`/import/${s.id}`}>
                        <Button variant="ghost" style={{ fontSize: 11, padding: '3px 8px' }}>Report →</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </PageContent>
    </>
  )
}
