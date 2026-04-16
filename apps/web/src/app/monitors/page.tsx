'use client'

import Link from 'next/link'
import { Badge, Card, DataTable, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

function statusTone(s: string | null): 'green' | 'red' | 'amber' | 'neutral' {
  if (s === 'up') return 'green'
  if (s === 'down') return 'red'
  if (s === 'pending') return 'amber'
  return 'neutral'
}

export default function MonitorsPage() {
  const list = trpc.monitors.list.useQuery(undefined, { refetchInterval: 30_000 })

  const upCount = list.data?.filter(m => m.status === 'up').length ?? 0
  const downCount = list.data?.filter(m => m.status === 'down').length ?? 0
  const total = list.data?.length ?? 0

  return (
    <>
      <Topbar
        title="Uptime monitors"
        actions={
          <Link href="/connections" style={{ fontSize: 11, color: 'var(--pu-400)' }}>
            Manage connections →
          </Link>
        }
      />
      <PageContent>
        {total > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
            <StatPill label="Total" value={total} tone="neutral" />
            <StatPill label="Up" value={upCount} tone="green" />
            <StatPill label="Down" value={downCount} tone="red" />
          </div>
        )}

        <Card header={<span>All monitors</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Domain</th>
                <th style={{ ...th, width: '25%' }}>URL</th>
                <th style={{ ...th, width: '12%' }}>Status</th>
                <th style={{ ...th, width: '20%' }}>Last check</th>
                <th style={th}>Provider</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>Loading…</td></tr>
              )}
              {!list.isLoading && total === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>
                    No monitors yet. Open a route and attach an uptime connection.
                  </td>
                </tr>
              )}
              {list.data?.map(m => (
                <tr key={m.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <Link href={`/routes?domain=${m.domain}`} style={{ color: 'var(--pu-400)' }}>
                      {m.domain}
                    </Link>
                  </td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {m.url}
                  </td>
                  <td style={td}>
                    <Badge tone={statusTone(m.status)}>{m.status ?? 'unknown'}</Badge>
                  </td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)' }}>
                    {m.lastCheck ? new Date(m.lastCheck).toLocaleString() : '—'}
                  </td>
                  <td style={td}>
                    {m.providerUrl ? (
                      <a href={m.providerUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--pu-400)' }}>
                        Open ↗
                      </a>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          Monitors are created per-route via the route detail page. Supported providers: Uptime Kuma, Betterstack, Freshping.
          Status refreshes every 30 seconds.
        </div>
      </PageContent>
    </>
  )
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' | 'neutral' }) {
  const colors: Record<string, string> = {
    green: 'var(--green-400, #4ade80)',
    red: 'var(--red-400, #f87171)',
    neutral: 'var(--text-secondary)',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: colors[tone] }}>{value}</span>
    </div>
  )
}
