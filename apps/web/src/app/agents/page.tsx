'use client'

import Link from 'next/link'
import { Badge, Button, Card, Dot, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function AgentsPage() {
  const list = trpc.agents.list.useQuery()

  const online = list.data?.filter(a => a.status === 'online').length ?? 0
  const total = list.data?.length ?? 0

  return (
    <>
      <Topbar title="Agents" actions={
        <Link href="/agents/new">
          <Button variant="primary">+ Register Agent</Button>
        </Link>
      } />
      <PageContent>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total agents', value: total },
            { label: 'Online', value: online },
            { label: 'Offline', value: total - online },
          ].map(c => (
            <Card key={c.label}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{c.value}</div>
            </Card>
          ))}
        </div>

        <Card header={<span>Agent fleet</span>}>
          {list.isLoading && <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>}
          {!list.isLoading && total === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              No agents registered. <Link href="/agents/new" style={{ color: 'var(--accent)' }}>Register your first agent →</Link>
            </div>
          )}
          {total > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Name', 'Site', 'Status', 'Last seen', 'Caddy', 'Routes', 'Certs', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data?.map(agent => (
                  <tr key={agent.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}>
                      <Link href={`/agents/${agent.id}`} style={{ color: 'var(--accent)', fontWeight: 500 }}>
                        {agent.name}
                      </Link>
                    </td>
                    <td style={td}>{agent.siteTag ?? <span style={{ color: 'var(--text-ghost)' }}>—</span>}</td>
                    <td style={td}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Dot tone={agent.status === 'online' ? 'green' : agent.status === 'error' ? 'red' : 'neutral'} />
                        {agent.status}
                      </span>
                    </td>
                    <td style={td}>
                      {agent.lastSeen
                        ? new Date(agent.lastSeen).toLocaleTimeString()
                        : <span style={{ color: 'var(--text-ghost)' }}>never</span>}
                    </td>
                    <td style={td}>
                      {agent.caddyVersion
                        ? <Badge tone="neutral">{agent.caddyVersion}</Badge>
                        : <span style={{ color: 'var(--text-ghost)' }}>—</span>}
                    </td>
                    <td style={td}>{agent.routeCount}</td>
                    <td style={td}>{agent.certCount}</td>
                    <td style={td}>
                      <Link href={`/agents/${agent.id}`}>
                        <Button variant="ghost" style={{ fontSize: 11, padding: '3px 8px' }}>Detail →</Button>
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
