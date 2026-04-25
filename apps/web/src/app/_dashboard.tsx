'use client'

import Link from 'next/link'
import { Badge, Button, Card, DataTable, Dot, StatCard, td, th } from '~/components/ui'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import type { AppRouter } from '@proxyos/api'
import type { inferRouterOutputs } from '@trpc/server'

type Outputs = inferRouterOutputs<AppRouter>

interface DashboardProps {
  initialRoutes?: Outputs['routes']['list']
  initialCerts?: Outputs['certificates']['list']
  initialDrift?: Outputs['drift']['list']
  initialStale?: Outputs['routes']['listStale']
}

export default function DashboardClient({ initialRoutes, initialCerts, initialDrift, initialStale }: DashboardProps) {
  const prefetchedAt = initialRoutes != null ? Date.now() : undefined

  const routes = trpc.routes.list.useQuery(undefined, {
    initialData: initialRoutes,
    initialDataUpdatedAt: prefetchedAt,
  })
  const certs = trpc.certificates.list.useQuery(undefined, {
    initialData: initialCerts,
    initialDataUpdatedAt: prefetchedAt,
  })
  const caddy = trpc.system.caddyStatus.useQuery(undefined, { refetchInterval: 15_000, staleTime: 0 })
  const drift = trpc.drift.list.useQuery(undefined, {
    refetchInterval: 30_000,
    initialData: initialDrift,
    initialDataUpdatedAt: prefetchedAt,
  })
  const stale = trpc.routes.listStale.useQuery({ days: 30 }, {
    initialData: initialStale,
    initialDataUpdatedAt: prefetchedAt,
  })
  const archiveMut = trpc.routes.archive.useMutation({ onSuccess: () => stale.refetch() })

  const activeRoutes = routes.data?.length ?? 0
  const expiringCerts = certs.data?.filter((c) => {
    if (!c.expiresAt) return false
    const days = (new Date(c.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    return days <= 14 && days > 0
  }).length ?? 0

  return (
    <>
      <Topbar
        title="Dashboard"
        actions={
          <>
            <Link href="/scanner"><Button variant="ghost">Scanner</Button></Link>
            <Link href="/import"><Button variant="ghost">Import</Button></Link>
            <Link href="/expose"><Button variant="primary">+ Expose service</Button></Link>
          </>
        }
      />
      <PageContent>
        <PageHeader title="Dashboard" desc="ProxyOS overview — routes, agents, certificates, and traffic." />

        {(drift.data?.length ?? 0) > 0 && (
          <div style={{
            background: 'var(--amber-dim)',
            border: '1px solid var(--amber-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--amber)', fontWeight: 600 }}>⚠</span>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>Config drift detected</span>
              <span style={{ color: 'var(--text2)', fontSize: 12 }}>
                {drift.data!.length} route{drift.data!.length !== 1 ? 's' : ''} out of sync between ProxyOS and Caddy
              </span>
            </div>
            <Link href="/settings/drift">
              <Button variant="ghost" style={{ fontSize: 12, color: 'var(--amber)' }}>View →</Button>
            </Link>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <StatCard
            label="Active routes"
            value={activeRoutes}
            sub={caddy.data?.reachable ? 'Caddy healthy' : 'Caddy unreachable'}
            subTone={caddy.data?.reachable ? 'green' : 'red'}
          />
          <StatCard label="Agents online" value="0 / 0" sub="No agents yet" subTone="muted" />
          <StatCard label="Requests / 24h" value="—" sub="no data" subTone="muted" />
          <StatCard
            label="Certs expiring"
            value={expiringCerts}
            sub={expiringCerts > 0 ? 'Within 14 days' : 'None expiring'}
            subTone={expiringCerts > 0 ? 'amber' : 'green'}
          />
        </div>

        <Card header={<><span>Routes</span><Link href="/routes" style={{ fontSize: 11, color: 'var(--pu-400)' }}>View all →</Link></>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Domain</th>
                <th style={{ ...th, width: '26%' }}>Upstream</th>
                <th style={{ ...th, width: '12%' }}>TLS</th>
                <th style={{ ...th, width: '12%' }}>SSO</th>
                <th style={{ ...th, width: '20%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {routes.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No routes yet.</td></tr>
              )}
              {routes.data?.slice(0, 8).map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 500 }}>
                    <Link href={`/routes/${r.id}`} style={{ color: 'var(--text-primary)' }}>{r.domain}</Link>
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 11 }}>
                    {r.upstreams[0]?.address}
                  </td>
                  <td style={td}><Badge tone={r.tlsMode === 'off' ? 'red' : 'green'}>{r.tlsMode}</Badge></td>
                  <td style={td}>{r.ssoEnabled ? <Badge tone="purple">SSO</Badge> : <Badge tone="neutral">—</Badge>}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Dot tone="green" /> <span style={{ color: 'var(--text-secondary)' }}>active</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Card header={<span>Agents</span>}>
            <div style={{ padding: '16px 13px', color: 'var(--text-dim)', fontSize: 11 }}>
              Agents are not set up yet. Register your first agent in <Link href="/agents" style={{ color: 'var(--pu-400)' }}>Agents</Link>.
            </div>
          </Card>
          <Card header={<span>Certificates</span>}>
            <div style={{ padding: 0 }}>
              {certs.data?.length === 0 && (
                <div style={{ padding: '16px 13px', color: 'var(--text-dim)', fontSize: 11 }}>None yet.</div>
              )}
              {certs.data?.slice(0, 5).map((c) => {
                const days = c.expiresAt ? Math.round((new Date(c.expiresAt).getTime() - Date.now()) / 86_400_000) : null
                const tone = days == null ? 'neutral' : days < 8 ? 'red' : days < 30 ? 'amber' : 'green'
                return (
                  <div key={c.id} style={{ display: 'flex', padding: '10px 13px', borderTop: '0.5px solid var(--border)', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, fontSize: 12 }}>{c.domain}</div>
                    <Badge tone={tone as 'green' | 'amber' | 'red' | 'neutral'}>{days != null ? `${days}d` : c.status}</Badge>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {(stale.data?.length ?? 0) > 0 && (
          <Card header={<span style={{ color: 'var(--amber)' }}>Stale routes — {stale.data!.length} with no traffic in 30+ days</span>}>
            <DataTable>
              <thead>
                <tr>
                  <th style={{ ...th, width: '40%' }}>Domain</th>
                  <th style={{ ...th, width: '30%' }}>Last traffic</th>
                  <th style={{ ...th, width: '30%' }}></th>
                </tr>
              </thead>
              <tbody>
                {stale.data!.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      <Link href={`/routes/${r.id}`} style={{ color: 'var(--accent)' }}>{r.domain}</Link>
                    </td>
                    <td style={{ ...td, color: 'var(--text3)', fontSize: 11 }}>
                      {r.lastTrafficAt ? new Date(r.lastTrafficAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ ...td }}>
                      <Button
                        variant="ghost"
                        style={{ fontSize: 11, color: 'var(--amber)', padding: '2px 8px' }}
                        onClick={() => { if (confirm(`Archive ${r.domain}?`)) archiveMut.mutate({ id: r.id }) }}
                      >
                        Archive
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        )}
      </PageContent>
    </>
  )
}
