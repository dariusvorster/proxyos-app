'use client'

import Link from 'next/link'
import { use, type ReactNode } from 'react'
import { Badge, Button, Card, Dot, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const utils = trpc.useUtils()
  const agent = trpc.agents.get.useQuery({ id })
  const health = trpc.agents.getHealth.useQuery({ id })
  const metrics = trpc.agents.getMetrics.useQuery({ id, range: 60 })
  const revokeMut = trpc.agents.revokeToken.useMutation({
    onSuccess: () => { void utils.agents.list.invalidate(); void agent.refetch() },
  })
  const deleteMut = trpc.agents.delete.useMutation({
    onSuccess: () => window.history.back(),
  })

  if (agent.isLoading) return (
    <>
      <Topbar title="Agent" />
      <PageContent><div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div></PageContent>
    </>
  )

  if (!agent.data) return (
    <>
      <Topbar title="Agent not found" />
      <PageContent><div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Agent not found.</div></PageContent>
    </>
  )

  const a = agent.data

  return (
    <>
      <Topbar title={a.name} actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/agents/${id}/scan`}>
            <Button variant="ghost">Docker Scanner</Button>
          </Link>
          <Button variant="ghost" style={{ color: 'var(--amber)' }}
            onClick={() => { if (confirm('Revoke this agent token? The agent will disconnect.')) revokeMut.mutate({ id }) }}>
            Revoke Token
          </Button>
          <Button variant="ghost" style={{ color: 'var(--red)' }}
            onClick={() => { if (confirm('Delete this agent permanently?')) deleteMut.mutate({ id }) }}>
            Delete
          </Button>
        </div>
      } />
      <PageContent>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Status card */}
          <Card header={<span>Status</span>}>
            <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
              {[
                ['Status', <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Dot tone={a.status === 'online' ? 'green' : a.status === 'error' ? 'red' : 'neutral'} />
                  {a.status}
                </span>],
                ['Site', a.siteTag ?? '—'],
                ['Description', a.description ?? '—'],
                ['Caddy version', health.data?.caddyVersion ?? '—'],
                ['Last seen', a.lastSeen ? new Date(a.lastSeen).toLocaleString() : 'never'],
                ['Token expires', new Date(a.tokenExpiresAt).toLocaleDateString()],
                ['Routes', a.routeCount],
                ['Certs', a.certCount],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                  <span style={{ color: 'var(--text-dim)' }}>{k}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{v as ReactNode}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Health summary */}
          <Card header={<span>Health summary</span>}>
            {!health.data
              ? <div style={{ fontSize: 12, color: 'var(--text-ghost)' }}>No health data yet</div>
              : (
                <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
                  {[
                    ['Caddy version', health.data.caddyVersion ?? '—'],
                    ['Active routes', health.data.routeCount],
                    ['Certificates', health.data.certCount],
                    ['Last seen', health.data.lastSeen ? new Date(health.data.lastSeen).toLocaleString() : 'never'],
                  ].map(([k, v]) => (
                    <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                      <span style={{ color: 'var(--text-dim)' }}>{k}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
          </Card>
        </div>

        {/* Metrics */}
        <Card header={<span>Route metrics (last 60 min)</span>} style={{ marginTop: 16 }}>
          {!metrics.data || metrics.data.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-ghost)' }}>No metrics collected yet. Metrics arrive every 30s after the agent connects.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>{['Route ID', 'Bucket', 'Requests', 'Errors', 'p95 ms', 'Bytes in', 'Bytes out'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {metrics.data.map((m, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={td}><code style={{ fontSize: 10 }}>{m.routeId.slice(0, 8)}</code></td>
                      <td style={td}>{new Date(m.bucket * 1000).toLocaleTimeString()}</td>
                      <td style={td}>{m.reqCount}</td>
                      <td style={td}>{m.errorCount}</td>
                      <td style={td}>{m.p95Ms ?? '—'}</td>
                      <td style={td}>{m.bytesIn.toLocaleString()}</td>
                      <td style={td}>{m.bytesOut.toLocaleString()}</td>
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
