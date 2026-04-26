'use client'

import Link from 'next/link'
import { useMemo, useState, type CSSProperties } from 'react'
import { Badge, Button, Card, Checkbox, DataTable, Dot, Input, Select, SidePanel, Sparkline, td, th, Toggle } from '~/components/ui'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useSiteSelection } from '~/lib/site-context'
import type { Route } from '@proxyos/types'

type TlsFilter = 'all' | 'auto' | 'dns' | 'internal' | 'custom' | 'off'
type SsoFilter = 'all' | 'on' | 'off'
type TypeFilter = 'all' | 'proxy'
type ExposureFilter = 'all' | 'direct' | 'tunnel'

export default function RoutesPage() {
  const utils = trpc.useUtils()
  const { siteId } = useSiteSelection()
  const list = trpc.routes.list.useQuery({ siteId })
  const del = trpc.routes.delete.useMutation({ onSuccess: () => utils.routes.list.invalidate() })

  const [search, setSearch] = useState('')
  const [tlsFilter, setTlsFilter] = useState<TlsFilter>('all')
  const [ssoFilter, setSsoFilter] = useState<SsoFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [exposureFilter, setExposureFilter] = useState<ExposureFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [panelId, setPanelId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return (list.data ?? []).filter((r) => {
      if (search && !r.domain.toLowerCase().includes(search.toLowerCase()) && !r.name.toLowerCase().includes(search.toLowerCase())) return false
      if (tlsFilter !== 'all' && r.tlsMode !== tlsFilter) return false
      if (ssoFilter === 'on' && !r.ssoEnabled) return false
      if (ssoFilter === 'off' && r.ssoEnabled) return false
      if (exposureFilter === 'tunnel' && r.exposureMode !== 'tunnel') return false
      if (exposureFilter === 'direct' && r.exposureMode === 'tunnel') return false
      return true
    })
  }, [list.data, search, tlsFilter, ssoFilter, exposureFilter])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((r) => r.id)))
  }

  const panelRoute = list.data?.find((r) => r.id === panelId) ?? null

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '5px 14px',
    fontSize: 12,
    fontWeight: active ? 500 : 400,
    color: active ? 'var(--text-primary)' : 'var(--text-dim)',
    background: active ? 'rgba(124,111,240,0.15)' : 'transparent',
    border: 0,
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'inherit',
  })

  return (
    <>
      <Topbar
        title="Routes"
        actions={<Link href="/expose"><Button variant="primary">+ Expose service</Button></Link>}
      />
      <div style={{ display: 'flex', gap: 4, padding: '8px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surf)' }}>
        <button style={tabStyle(typeFilter === 'all')} onClick={() => setTypeFilter('all')}>All</button>
        <button style={tabStyle(typeFilter === 'proxy')} onClick={() => setTypeFilter('proxy')}>Proxy</button>
      </div>
      <PageContent>
        <PageHeader title="Routes" desc="All proxy routes managed by this ProxyOS instance." />
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', flexWrap: 'wrap' }}>
            <Select value={tlsFilter} onChange={(e) => setTlsFilter(e.target.value as TlsFilter)}>
              <option value="all">All TLS modes</option>
              <option value="auto">auto</option>
              <option value="dns">dns</option>
              <option value="internal">internal</option>
              <option value="custom">custom</option>
              <option value="off">off</option>
            </Select>
            <Select value={ssoFilter} onChange={(e) => setSsoFilter(e.target.value as SsoFilter)}>
              <option value="all">All SSO</option>
              <option value="on">SSO on</option>
              <option value="off">SSO off</option>
            </Select>
            <Select value={exposureFilter} onChange={(e) => setExposureFilter(e.target.value as ExposureFilter)}>
              <option value="all">All exposure</option>
              <option value="direct">Direct</option>
              <option value="tunnel">Tunnel</option>
            </Select>
            <Input placeholder="Search domain…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }} />
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{filtered.length} / {list.data?.length ?? 0} routes</span>
          </div>
        </Card>

        {selected.size > 0 && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}><strong>{selected.size}</strong> selected</span>
              <Button size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  for (const id of selected) del.mutate({ id })
                  setSelected(new Set())
                }}
              >Delete</Button>
            </div>
          </Card>
        )}

        <Card header={<><span>Routes</span><span style={{ color: 'var(--text-dim)' }}>{filtered.length}</span></>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: 34 }}>
                  <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onChange={selectAll} />
                </th>
                <th style={{ ...th, width: '22%' }}>Domain</th>
                <th style={{ ...th, width: '18%' }}>Upstream</th>
                <th style={{ ...th, width: '8%' }}>TLS</th>
                <th style={{ ...th, width: '8%' }}>SSO</th>
                <th style={{ ...th, width: '8%' }}>Origin</th>
                <th style={{ ...th, width: '10%' }}>Req/h</th>
                <th style={{ ...th, width: '10%' }}>p95</th>
                <th style={{ ...th, width: '13%' }}>Last req</th>
                <th style={{ ...th, width: '9%' }}>Sync</th>
                <th style={{ ...th, width: '11%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No routes match your filters.</td></tr>
              )}
              {filtered.map((r) => (
                <RouteRow
                  key={r.id}
                  route={r}
                  checked={selected.has(r.id)}
                  onCheck={() => toggleSelect(r.id)}
                  onOpen={() => setPanelId(r.id)}
                />
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>

      <SidePanel open={panelId !== null} onClose={() => setPanelId(null)} title={panelRoute?.domain ?? 'Route'}>
        {panelRoute && <RoutePanel route={panelRoute} />}
      </SidePanel>
    </>
  )
}

function ChainHealthDots({ routeId }: { routeId: string }) {
  const chain = trpc.chain.getForRoute.useQuery({ routeId }, { refetchInterval: 60_000 })
  if (!chain.data || chain.data.nodes.length === 0) return null
  const tone = chain.data.rollup === 'ok' ? 'green' : chain.data.rollup === 'warning' ? 'amber' : chain.data.rollup === 'error' ? 'red' : 'neutral'
  return (
    <span title={`Chain: ${chain.data.rollup}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6 }}>
      {chain.data.nodes.slice(0, 5).map((n) => (
        <Dot key={n.id} tone={n.status === 'ok' ? 'green' : n.status === 'warning' ? 'amber' : n.status === 'error' ? 'red' : 'neutral'} />
      ))}
      {chain.data.nodes.length > 5 && <span style={{ fontSize: 9, color: 'var(--text-ghost)' }}>+{chain.data.nodes.length - 5}</span>}
    </span>
  )
}

function syncDot(status: string | null | undefined): { tone: 'green' | 'red' | 'amber' | 'neutral'; label: string; title: string } {
  switch (status) {
    case 'synced': return { tone: 'green', label: 'Synced', title: 'Route verified in Caddy' }
    case 'drift': return { tone: 'red', label: 'Drift', title: 'Caddy state differs from config — click for details' }
    case 'synced-machine': return { tone: 'neutral', label: 'Machine', title: 'Managed by automation — diff is expected' }
    case 'missing': return { tone: 'red', label: 'Missing', title: 'Route not found in Caddy — may need repush' }
    case 'error': return { tone: 'amber', label: 'Error', title: 'Verification failed — see system log' }
    default: return { tone: 'neutral', label: '—', title: 'Not yet verified' }
  }
}

function tunnelBadge(exposureMode?: string, publicUrl?: string | null): { label: string; tone: 'purple' | 'blue' | 'green' } | null {
  if (exposureMode !== 'tunnel' || !publicUrl) return null
  if (publicUrl.includes('.ts.net')) return { label: 'TS', tone: 'blue' }
  if (publicUrl.includes('ngrok')) return { label: 'ngrok', tone: 'green' }
  return { label: 'CF', tone: 'purple' }
}

function RouteRow({ route, checked, onCheck, onOpen }: { route: { id: string; domain: string; name: string; upstreams: Array<{ address: string }>; tlsMode: string; ssoEnabled: boolean; origin?: string; syncStatus?: string | null; exposureMode?: string; tunnelPublicUrl?: string | null }; checked: boolean; onCheck: () => void; onOpen: () => void }) {
  const summary = trpc.analytics.summary.useQuery({ routeId: route.id, windowMinutes: 60 }, { refetchInterval: 30_000 })
  const last = summary.data?.buckets.slice(-1)[0]
  return (
    <tr onClick={onOpen} style={{ cursor: 'pointer' }}>
      <td style={td} onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={checked} onChange={onCheck} />
      </td>
      <td style={td} role="button">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{route.domain}</span>
          {(() => { const b = tunnelBadge(route.exposureMode, route.tunnelPublicUrl); return b ? <Badge tone={b.tone}>{b.label}</Badge> : null })()}
          <a
            href={`${route.tlsMode === 'off' ? 'http' : 'https'}://${route.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ color: 'var(--text-dim)', lineHeight: 1, flexShrink: 0 }}
            title="Open site"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7" />
              <path d="M8 1h3v3" />
              <path d="M11 1 5.5 6.5" />
            </svg>
          </a>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{route.name}</div>
      </td>
      <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 11 }}>
        {route.upstreams.map((u) => u.address).join(', ')}
      </td>
      <td style={td}><Badge tone={route.tlsMode === 'off' ? 'red' : route.tlsMode === 'internal' || route.tlsMode === 'auto-staging' ? 'amber' : 'green'}>{route.tlsMode}</Badge></td>
      <td style={td}>{route.ssoEnabled ? <Badge tone="purple">ON</Badge> : <Badge tone="neutral">—</Badge>}</td>
      <td style={td}>
        {route.origin === 'local'
          ? <Badge tone="blue">local</Badge>
          : <Badge tone="neutral">central</Badge>}
      </td>
      <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--pu-400)' }}>{summary.data?.requests ?? 0}</td>
      <td style={{ ...td, color: 'var(--text-secondary)' }}>{summary.data?.avgLatencyMs ?? 0}ms</td>
      <td style={{ ...td, color: 'var(--text-dim)', fontSize: 10 }}>
        {last ? new Date(last.t).toLocaleTimeString() : '—'}
      </td>
      <td style={td} title={syncDot(route.syncStatus).title}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Dot tone={syncDot(route.syncStatus).tone} />
          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{syncDot(route.syncStatus).label}</span>
        </span>
      </td>
      <td style={td}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Dot tone="green" /><span style={{ color: 'var(--text-secondary)' }}>active</span>
          <ChainHealthDots routeId={route.id} />
        </span>
      </td>
    </tr>
  )
}

function SecuritySection({ routeId }: { routeId: string }) {
  const geo = trpc.security.getGeoIPConfig.useQuery({ routeId })
  const fail2ban = trpc.security.listFail2banRules.useQuery()
  const activeRules = fail2ban.data?.filter((r) => r.enabled) ?? []

  return (
    <Section title="Security">
      <Row
        k="GeoIP"
        v={geo.data?.config
          ? <Badge tone={geo.data.config.mode === 'allowlist' ? 'green' : 'amber'}>
              {geo.data.config.mode} · {geo.data.config.countries.length} countries
            </Badge>
          : <span style={{ color: 'var(--text3)', fontSize: 11 }}>off</span>
        }
      />
      <Row
        k="Fail2ban"
        v={activeRules.length > 0
          ? <Badge tone="amber">{activeRules.length} active rule{activeRules.length !== 1 ? 's' : ''}</Badge>
          : <span style={{ color: 'var(--text3)', fontSize: 11 }}>none</span>
        }
      />
    </Section>
  )
}

function ChainNodes({ routeId }: { routeId: string }) {
  const chain = trpc.chain.getForRoute.useQuery({ routeId }, { refetchInterval: 30_000 })
  if (!chain.data || chain.data.nodes.length === 0) return <span style={{ fontSize: 11, color: 'var(--text3)' }}>No chain configured</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: '6px 0' }}>
      {chain.data.nodes.map((node, i) => {
        const statusColor = node.status === 'ok' ? 'var(--green)' : node.status === 'warning' ? 'var(--amber)' : 'var(--red)'
        return (
          <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {i > 0 && <div style={{ height: 1, width: 20, minWidth: 16, background: 'var(--border2)', marginTop: -18, flexShrink: 0 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 56, padding: '0 2px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--surf2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'var(--text2)' }}>
                  {(node.label ?? '?')[0]?.toUpperCase()}
                </div>
                <div style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6, borderRadius: '50%', background: statusColor, border: '1px solid var(--surf)' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', textAlign: 'center', whiteSpace: 'nowrap', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {node.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TunnelExposureSection({ route }: { route: Route }) {
  const utils = trpc.useUtils()
  const providers = trpc.tunnels.providers.list.useQuery()
  const enableMut = trpc.tunnels.routes.enable.useMutation({ onSuccess: () => utils.routes.list.invalidate() })
  const disableMut = trpc.tunnels.routes.disable.useMutation({ onSuccess: () => utils.routes.list.invalidate() })
  const [selectedProvider, setSelectedProvider] = useState<string>('')

  const isTunnel = route.exposureMode === 'tunnel'

  return (
    <Section title="Tunnel exposure">
      {isTunnel ? (
        <>
          <Row k="Mode" v={<Badge tone="purple">tunnel</Badge>} />
          {route.tunnelPublicUrl && (
            <Row k="Public URL" v={
              <a href={route.tunnelPublicUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: 'var(--purple)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                {route.tunnelPublicUrl}
              </a>
            } />
          )}
          <div style={{ marginTop: 6 }}>
            <Button size="sm" variant="danger" onClick={() => { if (confirm('Disable tunnel exposure?')) disableMut.mutate({ routeId: route.id }) }} disabled={disableMut.isPending}>
              {disableMut.isPending ? 'Disabling…' : 'Disable tunnel'}
            </Button>
          </div>
          {disableMut.isError && <div style={{ fontSize: 11, color: 'var(--red)' }}>{disableMut.error.message}</div>}
        </>
      ) : (
        <>
          <Row k="Mode" v={<Badge tone="neutral">direct</Badge>} />
          {providers.data && providers.data.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
              <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}
                style={{ flex: 1, padding: '5px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11 }}>
                <option value="">Choose provider…</option>
                {providers.data.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
              <Button size="sm" variant="primary" disabled={!selectedProvider || enableMut.isPending}
                onClick={() => enableMut.mutate({ routeId: route.id, providerId: selectedProvider })}>
                {enableMut.isPending ? 'Enabling…' : 'Enable'}
              </Button>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              No tunnel providers configured. Add one in Settings → Tunnels.
            </div>
          )}
          {enableMut.isError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{enableMut.error.message}</div>}
        </>
      )}
    </Section>
  )
}

function RoutePanel({ route }: { route: Route }) {
  const utils = trpc.useUtils()
  const del = trpc.routes.delete.useMutation({ onSuccess: () => utils.routes.list.invalidate() })
  const update = trpc.routes.update.useMutation({ onSuccess: () => utils.routes.list.invalidate() })
  const summary = trpc.analytics.summary.useQuery({ routeId: route.id, windowMinutes: 1440 }, { refetchInterval: 10_000 })

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(route.name)
  const [upstreams, setUpstreams] = useState(route.upstreams.map((u) => u.address))
  const [lbPolicy, setLbPolicy] = useState<'round_robin' | 'least_conn' | 'ip_hash' | 'random' | 'first'>(route.lbPolicy ?? 'round_robin')
  const [tlsMode, setTlsMode] = useState<'auto' | 'auto-staging' | 'dns' | 'internal' | 'custom' | 'off'>(route.tlsMode as 'auto' | 'auto-staging' | 'dns' | 'internal' | 'custom' | 'off')
  const [ssoEnabled, setSsoEnabled] = useState(route.ssoEnabled)
  const [compression, setCompression] = useState(!!route.compressionEnabled)
  const [websocket, setWebsocket] = useState(!!route.websocketEnabled)
  const [http3, setHttp3] = useState(!!route.http3Enabled)
  const [healthPath, setHealthPath] = useState(route.healthCheckPath ?? '/')
  const [forceSSL, setForceSSL] = useState(!!route.forceSSL)
  const [hstsEnabled, setHstsEnabled] = useState(!!route.hstsEnabled)
  const [hstsSubdomains, setHstsSubdomains] = useState(!!route.hstsSubdomains)
  const [trustHeaders, setTrustHeaders] = useState(!!route.trustUpstreamHeaders)
  const [skipTlsVerify, setSkipTlsVerify] = useState(!!route.skipTlsVerify)

  function startEdit() {
    setName(route.name)
    setUpstreams(route.upstreams.map((u) => u.address))
    setLbPolicy(route.lbPolicy ?? 'round_robin')
    setTlsMode(route.tlsMode)
    setSsoEnabled(route.ssoEnabled)
    setCompression(!!route.compressionEnabled)
    setWebsocket(!!route.websocketEnabled)
    setHttp3(!!route.http3Enabled)
    setHealthPath(route.healthCheckPath ?? '/')
    setForceSSL(!!route.forceSSL)
    setHstsEnabled(!!route.hstsEnabled)
    setHstsSubdomains(!!route.hstsSubdomains)
    setTrustHeaders(!!route.trustUpstreamHeaders)
    setSkipTlsVerify(!!route.skipTlsVerify)
    setEditing(true)
  }

  function save() {
    update.mutate({
      id: route.id,
      patch: {
        name,
        upstreams: upstreams.filter(Boolean).map((a) => ({ address: a })),
        lbPolicy,
        tlsMode,
        ssoEnabled,
        compressionEnabled: compression,
        websocketEnabled: websocket,
        http3Enabled: http3,
        healthCheckPath: healthPath,
        forceSSL,
        hstsEnabled,
        hstsSubdomains,
        trustUpstreamHeaders: trustHeaders,
        skipTlsVerify,
      },
    }, { onSuccess: () => setEditing(false) })
  }

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <Section title="General">
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </Section>

        <Section title="Upstream">
          {upstreams.map((addr, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Input
                value={addr}
                onChange={(e) => setUpstreams((prev) => prev.map((a, j) => j === i ? e.target.value : a))}
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                placeholder="http://host:port"
              />
              {upstreams.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => setUpstreams((prev) => prev.filter((_, j) => j !== i))}>✕</Button>
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setUpstreams((prev) => [...prev, ''])}>+ Add upstream</Button>
          {upstreams.length > 1 && (
            <label style={{ display: 'grid', gap: 4, marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Load balancing</span>
              <Select value={lbPolicy} onChange={(e) => setLbPolicy(e.target.value as typeof lbPolicy)}>
                <option value="round_robin">Round Robin</option>
                <option value="least_conn">Least Connections</option>
                <option value="ip_hash">IP Hash</option>
                <option value="random">Random</option>
                <option value="first">First</option>
              </Select>
            </label>
          )}
        </Section>

        <Section title="TLS">
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mode</span>
            <Select value={tlsMode} onChange={(e) => setTlsMode(e.target.value as typeof tlsMode)}>
              <option value="auto">auto</option>
              <option value="auto-staging">auto-staging (LE staging)</option>
              <option value="dns">dns</option>
              <option value="internal">internal</option>
              <option value="custom">custom</option>
              <option value="off">off</option>
            </Select>
          </label>
        </Section>

        <Section title="SSO">
          <Row k="Enabled" v={<Toggle checked={ssoEnabled} onChange={setSsoEnabled} />} />
        </Section>

        <Section title="Options">
          <Row k="Compression" v={<Toggle checked={compression} onChange={setCompression} />} />
          <Row k="WebSocket" v={<Toggle checked={websocket} onChange={setWebsocket} />} />
          <Row k="HTTP/3" v={<Toggle checked={http3} onChange={setHttp3} />} />
          <label style={{ display: 'grid', gap: 4, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Health check path</span>
            <Input value={healthPath} onChange={(e) => setHealthPath(e.target.value)} placeholder="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          </label>
        </Section>

        <Section title="SSL / Security">
          <Row k="Force SSL" v={<Toggle checked={forceSSL} onChange={setForceSSL} />} />
          <Row k="HSTS" v={<Toggle checked={hstsEnabled} onChange={setHstsEnabled} />} />
          <Row k="HSTS Subdomains" v={<Toggle checked={hstsSubdomains} onChange={(v) => { setHstsSubdomains(v); if (v) setHstsEnabled(true) }} />} />
          <Row k="Trust Upstream Headers" v={<Toggle checked={trustHeaders} onChange={setTrustHeaders} />} />
          <Row k="Skip Upstream TLS Verify" v={<Toggle checked={skipTlsVerify} onChange={setSkipTlsVerify} />} />
        </Section>

        {update.isError && (
          <div style={{ fontSize: 11, color: 'var(--red)' }}>{update.error.message}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" size="sm" onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={update.isPending}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Section title="Upstream">
        <Row k="Targets" v={<span style={{ fontFamily: 'var(--font-mono)' }}>{route.upstreams.map((u) => u.address).join(', ')}</span>} />
        <Row k="Health" v={<Badge tone="green">healthy</Badge>} />
      </Section>
      <Section title="TLS">
        <Row k="Mode" v={<Badge tone={route.tlsMode === 'off' ? 'red' : route.tlsMode === 'auto-staging' ? 'amber' : 'green'}>{route.tlsMode}</Badge>} />
        {route.tlsDnsProviderId && <Row k="DNS provider" v={<span style={{ fontFamily: 'var(--font-mono)' }}>{route.tlsDnsProviderId}</span>} />}
      </Section>
      <Section title="SSO">
        <Row k="Enabled" v={<Toggle checked={route.ssoEnabled} onChange={() => {}} disabled />} />
        {route.ssoProviderId && <Row k="Provider" v={<span style={{ fontFamily: 'var(--font-mono)' }}>{route.ssoProviderId}</span>} />}
      </Section>
      <Section title="Options">
        <Row k="Compression" v={<Toggle checked={!!route.compressionEnabled} onChange={() => {}} disabled />} />
        <Row k="WebSocket" v={<Toggle checked={!!route.websocketEnabled} onChange={() => {}} disabled />} />
        <Row k="HTTP/3" v={<Toggle checked={!!route.http3Enabled} onChange={() => {}} disabled />} />
        <Row k="Health path" v={<span style={{ fontFamily: 'var(--font-mono)' }}>{route.healthCheckPath ?? '/'}</span>} />
      </Section>
      <Section title="SSL / Security">
        <Row k="Force SSL" v={<Toggle checked={!!route.forceSSL} onChange={() => {}} disabled />} />
        <Row k="HSTS" v={<Toggle checked={!!route.hstsEnabled} onChange={() => {}} disabled />} />
        <Row k="HSTS Subdomains" v={<Toggle checked={!!route.hstsSubdomains} onChange={() => {}} disabled />} />
        <Row k="Trust Upstream Headers" v={<Toggle checked={!!route.trustUpstreamHeaders} onChange={() => {}} disabled />} />
        <Row k="Skip Upstream TLS Verify" v={<Toggle checked={!!route.skipTlsVerify} onChange={() => {}} disabled />} />
      </Section>
      <SecuritySection routeId={route.id} />
      <Section title="Service chain">
        <ChainNodes routeId={route.id} />
      </Section>
      <Section title="Traffic (24h)">
        <Sparkline values={(summary.data?.buckets ?? []).map((b) => b.requests)} width={380} height={60} />
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
          {summary.data?.requests ?? 0} req · {summary.data?.status5xx ?? 0} errors · avg {summary.data?.avgLatencyMs ?? 0}ms
        </div>
      </Section>
      <TunnelExposureSection route={route} />
      <Section title="Actions">
        {route.origin === 'central' && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: 4 }}>managed by central — read-only</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {route.origin === 'local' && (
            <Button size="sm" variant="primary" onClick={startEdit}>Edit</Button>
          )}
          <Link href={`/routes/${route.id}`}><Button size="sm">Open analytics</Button></Link>
          {route.origin === 'local' && (
            <Button size="sm" variant="danger" onClick={() => { if (confirm(`Delete ${route.domain}?`)) del.mutate({ id: route.id }) }}>Delete</Button>
          )}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'grid', gap: 6 }}>{children}</div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
      <span style={{ color: 'var(--text-dim)' }}>{k}</span>
      <span style={{ color: 'var(--text-primary)' }}>{v}</span>
    </div>
  )
}
