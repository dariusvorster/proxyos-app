'use client'

import Link from 'next/link'
import { use, useState, type CSSProperties, type ReactNode } from 'react'
import { Badge, Button, Card, DataTable, Dot, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

function AgentRoutesTab({ agentId }: { agentId: string }) {
  const routes = trpc.routes.listByAgent.useQuery({ agentId })
  return (
    <Card header={<span>Routes — {routes.data?.length ?? 0}</span>}>
      {routes.isLoading && <div style={{ padding: 16, fontSize: 12, color: 'var(--text3)' }}>Loading…</div>}
      {!routes.isLoading && (routes.data?.length ?? 0) === 0 && (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--text3)' }}>No routes assigned to this agent.</div>
      )}
      {(routes.data?.length ?? 0) > 0 && (
        <DataTable>
          <thead>
            <tr>
              <th style={{ ...th, width: '30%' }}>Domain</th>
              <th style={{ ...th, width: '22%' }}>Upstream</th>
              <th style={{ ...th, width: '12%' }}>TLS</th>
              <th style={{ ...th, width: '10%' }}>SSO</th>
              <th style={{ ...th, width: '14%' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {routes.data?.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                  <Link href={`/routes/${r.id}`} style={{ color: 'var(--accent)' }}>{r.domain}</Link>
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>
                  {r.upstreams.map((u) => u.address).join(', ')}
                </td>
                <td style={td}><Badge tone={r.tlsMode === 'off' ? 'red' : r.tlsMode === 'internal' ? 'amber' : 'green'}>{r.tlsMode}</Badge></td>
                <td style={td}>{r.ssoEnabled ? <Badge tone="purple">ON</Badge> : <Badge tone="neutral">—</Badge>}</td>
                <td style={td}><span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Dot tone={r.enabled ? 'green' : 'neutral'} />{r.enabled ? 'active' : 'disabled'}</span></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Card>
  )
}

type Tab = 'routes' | 'metrics' | 'health' | 'certificates' | 'logs' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'routes', label: 'Routes' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'health', label: 'Health' },
  { id: 'certificates', label: 'Certificates' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' },
]

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
  const [tab, setTab] = useState<Tab>('routes')

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '10px 16px',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    fontWeight: active ? 500 : 400,
    color: active ? 'var(--text)' : 'var(--text2)',
    background: 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -1,
  })

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

      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 0, background: 'var(--surf)', padding: '0 24px' }}>
        {TABS.map((t) => (
          <button key={t.id} style={tabStyle(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <PageContent>
        {tab === 'routes' && <AgentRoutesTab agentId={id} />}

        {tab === 'metrics' && (
          <Card header={<span>Route metrics (last 60 min)</span>}>
            {!metrics.data || metrics.data.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text3)', padding: '16px 0' }}>No metrics collected yet. Metrics arrive every 30s after the agent connects.</div>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>{['Route ID', 'Bucket', 'Requests', 'Errors', 'p95 ms', 'Bytes in', 'Bytes out'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {metrics.data.map((m, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={td}><code style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>{m.routeId.slice(0, 8)}</code></td>
                        <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{new Date(m.bucket * 1000).toLocaleTimeString()}</td>
                        <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{m.reqCount}</td>
                        <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{m.errorCount}</td>
                        <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{m.p95Ms ?? '—'}</td>
                        <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{m.bytesIn.toLocaleString()}</td>
                        <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{m.bytesOut.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </Card>
        )}

        {tab === 'health' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card header={<span>Agent status</span>}>
              <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
                {([
                  ['Status', <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Dot tone={a.status === 'online' ? 'green' : a.status === 'error' ? 'red' : 'neutral'} />
                    {a.status}
                  </span>],
                  ['Site', a.siteTag ?? '—'],
                  ['Last seen', a.lastSeen ? new Date(a.lastSeen).toLocaleString() : 'never'],
                  ['Token expires', new Date(a.tokenExpiresAt).toLocaleDateString()],
                ] as [string, ReactNode][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                    <span style={{ color: 'var(--text2)' }}>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card header={<span>Caddy health</span>}>
              {!health.data
                ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>No health data yet</div>
                : (
                  <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
                    {([
                      ['Caddy version', health.data.caddyVersion ?? '—'],
                      ['Active routes', String(health.data.routeCount)],
                      ['Certificates', String(health.data.certCount)],
                      ['Last seen', health.data.lastSeen ? new Date(health.data.lastSeen).toLocaleString() : 'never'],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                        <span style={{ color: 'var(--text2)' }}>{k}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
            </Card>
          </div>
        )}

        {tab === 'certificates' && (
          <Card header={<span>Certificates — {a.certCount} total</span>}>
            <div style={{ fontSize: 12, color: 'var(--text2)', padding: '8px 0' }}>
              Per-certificate detail requires agent reporting. <Link href="/certificates" style={{ color: 'var(--accent)' }}>View all certificates →</Link>
            </div>
          </Card>
        )}

        {tab === 'logs' && (
          <Card header={<span>Agent logs</span>}>
            <div style={{ fontSize: 12, color: 'var(--text2)', padding: '8px 0' }}>
              Live log streaming from <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{a.name}</code> is not yet available.
            </div>
          </Card>
        )}

        {tab === 'settings' && (
          <Card header={<span>Agent settings</span>}>
            <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--text2)' }}>Name</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{a.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--text2)' }}>Description</span>
                <span>{a.description ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--text2)' }}>Site tag</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{a.siteTag ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button variant="ghost" style={{ color: 'var(--amber)' }}
                  onClick={() => { if (confirm('Revoke this agent token?')) revokeMut.mutate({ id }) }}>
                  Revoke token
                </Button>
                <Button variant="ghost" style={{ color: 'var(--red)' }}
                  onClick={() => { if (confirm('Delete this agent permanently?')) deleteMut.mutate({ id }) }}>
                  Delete agent
                </Button>
              </div>
            </div>
          </Card>
        )}
      </PageContent>
    </>
  )
}
