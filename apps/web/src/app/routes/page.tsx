'use client'

import Link from 'next/link'
import { useMemo, useState, type CSSProperties } from 'react'
import { Badge, Button, Card, Checkbox, DataTable, Dot, Input, Select, SidePanel, Sparkline, td, th, Toggle } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import type { Route } from '@proxyos/types'

type TlsFilter = 'all' | 'auto' | 'dns' | 'internal' | 'custom' | 'off'
type SsoFilter = 'all' | 'on' | 'off'
type TypeFilter = 'all' | 'proxy'

export default function RoutesPage() {
  const utils = trpc.useUtils()
  const list = trpc.routes.list.useQuery()
  const del = trpc.routes.delete.useMutation({ onSuccess: () => utils.routes.list.invalidate() })

  const [search, setSearch] = useState('')
  const [tlsFilter, setTlsFilter] = useState<TlsFilter>('all')
  const [ssoFilter, setSsoFilter] = useState<SsoFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [panelId, setPanelId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return (list.data ?? []).filter((r) => {
      if (search && !r.domain.toLowerCase().includes(search.toLowerCase()) && !r.name.toLowerCase().includes(search.toLowerCase())) return false
      if (tlsFilter !== 'all' && r.tlsMode !== tlsFilter) return false
      if (ssoFilter === 'on' && !r.ssoEnabled) return false
      if (ssoFilter === 'off' && r.ssoEnabled) return false
      return true
    })
  }, [list.data, search, tlsFilter, ssoFilter])

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
                <th style={{ ...th, width: '10%' }}>Req/h</th>
                <th style={{ ...th, width: '10%' }}>p95</th>
                <th style={{ ...th, width: '13%' }}>Last req</th>
                <th style={{ ...th, width: '11%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No routes match your filters.</td></tr>
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

function RouteRow({ route, checked, onCheck, onOpen }: { route: { id: string; domain: string; name: string; upstreams: Array<{ address: string }>; tlsMode: string; ssoEnabled: boolean }; checked: boolean; onCheck: () => void; onOpen: () => void }) {
  const summary = trpc.analytics.summary.useQuery({ routeId: route.id, windowMinutes: 60 }, { refetchInterval: 30_000 })
  const last = summary.data?.buckets.slice(-1)[0]
  return (
    <tr>
      <td style={td} onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={checked} onChange={onCheck} />
      </td>
      <td style={td} onClick={onOpen} role="button">
        <div style={{ fontWeight: 500, cursor: 'pointer', color: 'var(--text-primary)' }}>{route.domain}</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{route.name}</div>
      </td>
      <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 11 }}>
        {route.upstreams.map((u) => u.address).join(', ')}
      </td>
      <td style={td}><Badge tone={route.tlsMode === 'off' ? 'red' : route.tlsMode === 'internal' ? 'amber' : 'green'}>{route.tlsMode}</Badge></td>
      <td style={td}>{route.ssoEnabled ? <Badge tone="purple">ON</Badge> : <Badge tone="neutral">—</Badge>}</td>
      <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--pu-400)' }}>{summary.data?.requests ?? 0}</td>
      <td style={{ ...td, color: 'var(--text-secondary)' }}>{summary.data?.avgLatencyMs ?? 0}ms</td>
      <td style={{ ...td, color: 'var(--text-dim)', fontSize: 10 }}>
        {last ? new Date(last.t).toLocaleTimeString() : '—'}
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

function RoutePanel({ route }: { route: Route }) {
  const utils = trpc.useUtils()
  const del = trpc.routes.delete.useMutation({ onSuccess: () => utils.routes.list.invalidate() })
  const update = trpc.routes.update.useMutation({ onSuccess: () => utils.routes.list.invalidate() })
  const summary = trpc.analytics.summary.useQuery({ routeId: route.id, windowMinutes: 1440 }, { refetchInterval: 10_000 })

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(route.name)
  const [upstreams, setUpstreams] = useState(route.upstreams.map((u) => u.address))
  const [lbPolicy, setLbPolicy] = useState(route.lbPolicy ?? 'round_robin')
  const [tlsMode, setTlsMode] = useState(route.tlsMode)
  const [ssoEnabled, setSsoEnabled] = useState(route.ssoEnabled)
  const [compression, setCompression] = useState(!!route.compressionEnabled)
  const [websocket, setWebsocket] = useState(!!route.websocketEnabled)
  const [http3, setHttp3] = useState(!!route.http3Enabled)
  const [healthPath, setHealthPath] = useState(route.healthCheckPath ?? '/')

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
    setEditing(true)
  }

  function save() {
    update.mutate({
      id: route.id,
      patch: {
        name,
        upstreams: upstreams.filter(Boolean).map((a) => ({ address: a })),
        lbPolicy: lbPolicy as 'round_robin' | 'least_conn' | 'ip_hash' | 'random' | 'first',
        tlsMode: tlsMode as 'auto' | 'dns' | 'internal' | 'custom' | 'off',
        ssoEnabled,
        compressionEnabled: compression,
        websocketEnabled: websocket,
        http3Enabled: http3,
        healthCheckPath: healthPath,
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
              <Select value={lbPolicy} onChange={(e) => setLbPolicy(e.target.value)}>
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
            <Select value={tlsMode} onChange={(e) => setTlsMode(e.target.value)}>
              <option value="auto">auto</option>
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
        <Row k="Mode" v={<Badge tone={route.tlsMode === 'off' ? 'red' : 'green'}>{route.tlsMode}</Badge>} />
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
      <Section title="Traffic (24h)">
        <Sparkline values={(summary.data?.buckets ?? []).map((b) => b.requests)} width={380} height={60} />
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
          {summary.data?.requests ?? 0} req · {summary.data?.status5xx ?? 0} errors · avg {summary.data?.avgLatencyMs ?? 0}ms
        </div>
      </Section>
      <Section title="Actions">
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="primary" onClick={startEdit}>Edit</Button>
          <Link href={`/routes/${route.id}`}><Button size="sm">Open analytics</Button></Link>
          <Button size="sm" variant="danger" onClick={() => { if (confirm(`Delete ${route.domain}?`)) del.mutate({ id: route.id }) }}>Delete</Button>
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
