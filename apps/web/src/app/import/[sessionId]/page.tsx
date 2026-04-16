'use client'

import { use } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function ImportSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const session = trpc.importers.getSession.useQuery({ sessionId })

  if (session.isLoading) return (
    <>
      <Topbar title="Import report" />
      <PageContent><div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div></PageContent>
    </>
  )

  if (!session.data) return (
    <>
      <Topbar title="Import report" />
      <PageContent><div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Session not found.</div></PageContent>
    </>
  )

  const s = session.data
  const result = s.result as { created: string[]; skipped: string[]; failed: Array<{ domain: string; error: string }> } | null

  return (
    <>
      <Topbar title="Import report" actions={<Link href="/import/history"><Button variant="ghost">← History</Button></Link>} />
      <PageContent>
        <Card header={<span>Summary</span>} style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 12 }}>
            {[
              ['Session ID', <code style={{ fontSize: 10 }}>{s.id}</code>],
              ['Source', <Badge tone="neutral">{s.sourceType}</Badge>],
              ['Date', s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'],
              ['Total detected', s.routeCount],
              ['Imported', <span style={{ color: 'var(--green)' }}>{s.imported}</span>],
              ['Skipped', s.skipped],
              ['Failed', <span style={{ color: s.failed > 0 ? 'var(--red)' : 'inherit' }}>{s.failed}</span>],
            ].map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-dim)' }}>{k as string}</span>
                <span>{v as React.ReactNode}</span>
              </div>
            ))}
          </div>
        </Card>

        {result?.failed && result.failed.length > 0 && (
          <Card header={<span>Failed routes</span>} style={{ marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>{['Domain', 'Error'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {result.failed.map((f, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}>{f.domain}</td>
                    <td style={{ ...td, color: 'var(--red)', fontSize: 11 }}>{f.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {result?.created && result.created.length > 0 && (
          <Card header={<span>Created routes ({result.created.length})</span>}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>
              {result.created.map((id, i) => (
                <span key={id}>
                  <Link href={`/routes`} style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{id.slice(0, 8)}</Link>
                  {i < result.created.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          </Card>
        )}
      </PageContent>
    </>
  )
}
