'use client'

import { Fragment, useMemo, useState } from 'react'
import { Badge, Button, Card, DataTable, Input, Select, td, th, type BadgeTone } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'system' | 'access' | 'alerts' | 'caddy'
type Level = 'info' | 'warn' | 'error'
type Category = 'auth' | 'caddy' | 'system' | 'api' | 'user'

// ─── Level styling ────────────────────────────────────────────────────────────

const LEVEL_TONE: Record<Level, BadgeTone> = { info: 'blue', warn: 'amber', error: 'red' }
const LEVEL_DOT: Record<Level, string> = { info: 'var(--blue)', warn: 'var(--amber)', error: 'var(--red)' }

const CATEGORY_TONE: Record<Category, BadgeTone> = {
  auth: 'purple', caddy: 'green', system: 'neutral', api: 'blue', user: 'neutral',
}

const STATUS_TONE = (s: number): BadgeTone =>
  s < 300 ? 'green' : s < 400 ? 'blue' : s < 500 ? 'amber' : 'red'

// ─── CSV helper ───────────────────────────────────────────────────────────────

function csvEscape(v: string) {
  return v.includes('"') || v.includes(',') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
}

function downloadCsv(header: string[], rows: string[][], name: string) {
  const lines = [header.join(','), ...rows.map(r => r.map(csvEscape).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Shared filter bar ────────────────────────────────────────────────────────

function FilterBar({ search, setSearch, dateFrom, setDateFrom, dateTo, setDateTo, right }: {
  search: string; setSearch: (v: string) => void
  dateFrom: string; setDateFrom: (v: string) => void
  dateTo: string; setDateTo: (v: string) => void
  right?: React.ReactNode
}) {
  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>→</span>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {right}
      </div>
    </Card>
  )
}

// ─── System logs tab ──────────────────────────────────────────────────────────

function SystemLogsTab() {
  const [level, setLevel] = useState<Level | ''>('')
  const [category, setCategory] = useState<Category | ''>('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const clearMut = trpc.systemLog.clear.useMutation()

  const list = trpc.systemLog.list.useQuery({
    level: level || undefined,
    category: category || undefined,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: 500,
  }, { refetchInterval: 8_000 })

  const counts = trpc.systemLog.counts.useQuery(undefined, { refetchInterval: 8_000 })
  const rows = list.data ?? []

  function exportCsv() {
    downloadCsv(
      ['timestamp', 'level', 'category', 'message', 'user_id', 'detail'],
      rows.map(r => [
        new Date(r.createdAt).toISOString(), r.level, r.category, r.message, r.userId ?? '', JSON.stringify(r.detail ?? {}),
      ]),
      'proxyos-system-logs',
    )
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  return (
    <>
      {/* Level summary chips */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['info', 'warn', 'error'] as Level[]).map(l => (
          <button
            key={l}
            onClick={() => setLevel(prev => prev === l ? '' : l)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
              borderRadius: 6, border: `1px solid ${level === l ? LEVEL_DOT[l] : 'var(--border2)'}`,
              background: level === l ? `color-mix(in srgb, ${LEVEL_DOT[l]} 12%, transparent)` : 'var(--surf)',
              cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
              color: level === l ? LEVEL_DOT[l] : 'var(--text2)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: LEVEL_DOT[l], flexShrink: 0 }} />
            {l} · {counts.data?.[l] ?? '—'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Button onClick={exportCsv}>Export CSV</Button>
          <Button variant="danger" onClick={() => clearMut.mutate({ olderThanDays: 30 })} disabled={clearMut.isPending}>
            Clear &gt;30d
          </Button>
        </div>
      </div>

      <FilterBar
        search={search} setSearch={setSearch}
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
        right={
          <Select value={category} onChange={e => setCategory(e.target.value as Category | '')}>
            <option value="">All categories</option>
            <option value="auth">Auth</option>
            <option value="caddy">Caddy</option>
            <option value="system">System</option>
            <option value="api">API</option>
            <option value="user">User</option>
          </Select>
        }
      />

      <Card header={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          System logs
          <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{rows.length} entries</span>
        </span>
      }>
        <DataTable>
          <thead>
            <tr>
              <th style={{ ...th, width: 28 }} />
              <th style={{ ...th, width: '14%' }}>Time</th>
              <th style={{ ...th, width: '8%' }}>Level</th>
              <th style={{ ...th, width: '10%' }}>Category</th>
              <th style={th}>Message</th>
              <th style={{ ...th, width: '12%' }}>User</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: '32px 12px' }}>
                {list.isFetching ? 'Loading…' : 'No log entries.'}
              </td></tr>
            )}
            {rows.map(r => (
              <Fragment key={r.id}>
                <tr
                  style={{ cursor: r.detail ? 'pointer' : 'default', borderLeft: `2px solid ${LEVEL_DOT[r.level]}` }}
                  onClick={() => r.detail && toggleExpand(r.id)}
                >
                  <td style={{ ...td, color: 'var(--text3)', fontSize: 10 }}>{r.detail ? (expanded.has(r.id) ? '▾' : '▸') : ''}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td style={td}><Badge tone={LEVEL_TONE[r.level]}>{r.level}</Badge></td>
                  <td style={td}><Badge tone={CATEGORY_TONE[r.category as Category] ?? 'neutral'}>{r.category}</Badge></td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.message}</td>
                  <td style={{ ...td, color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{r.userId ?? '—'}</td>
                </tr>
                {expanded.has(r.id) && r.detail && (
                  <tr>
                    <td colSpan={6} style={{ ...td, background: 'var(--surf2)', padding: '10px 16px' }}>
                      <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {JSON.stringify(r.detail, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  )
}

// ─── Access logs tab ──────────────────────────────────────────────────────────

function AccessLogsTab() {
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const access = trpc.analytics.accessLog.useQuery({ limit: 500 }, { refetchInterval: 10_000 })

  const rows = useMemo(() => {
    return (access.data ?? []).filter(r => {
      if (search && !(r.path ?? '').toLowerCase().includes(search.toLowerCase()) && !(r.clientIp ?? '').includes(search)) return false
      const t = new Date(r.recordedAt).getTime()
      if (dateFrom && t < new Date(dateFrom).getTime()) return false
      if (dateTo && t > new Date(dateTo).getTime() + 86_400_000) return false
      return true
    })
  }, [access.data, search, dateFrom, dateTo])

  function exportCsv() {
    downloadCsv(
      ['timestamp', 'method', 'path', 'status', 'latency_ms', 'bytes_out', 'client_ip', 'user_agent'],
      rows.map(r => [
        new Date(r.recordedAt).toISOString(),
        r.method ?? '', r.path ?? '', String(r.statusCode ?? ''),
        String(r.latencyMs ?? ''), String(r.bytesOut ?? ''), r.clientIp ?? '', r.userAgent ?? '',
      ]),
      'proxyos-access-logs',
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={exportCsv}>Export CSV</Button>
      </div>
      <FilterBar
        search={search} setSearch={setSearch}
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
      />
      <Card header={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          HTTP access log
          <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{rows.length} entries</span>
        </span>
      }>
        <DataTable>
          <thead>
            <tr>
              <th style={{ ...th, width: '14%' }}>Time</th>
              <th style={{ ...th, width: '7%' }}>Method</th>
              <th style={th}>Path</th>
              <th style={{ ...th, width: '8%' }}>Status</th>
              <th style={{ ...th, width: '10%' }}>Latency</th>
              <th style={{ ...th, width: '14%' }}>Client IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: '32px 12px' }}>
                {access.isLoading ? 'Loading…' : 'No access log entries.'}
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                  {new Date(r.recordedAt).toLocaleString()}
                </td>
                <td style={td}>
                  {r.method && <Badge tone={r.method === 'GET' ? 'blue' : r.method === 'POST' ? 'green' : r.method === 'DELETE' ? 'red' : 'neutral'}>{r.method}</Badge>}
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.path ?? '—'}
                </td>
                <td style={td}>
                  {r.statusCode != null && <Badge tone={STATUS_TONE(r.statusCode)}>{r.statusCode}</Badge>}
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: (r.latencyMs ?? 0) > 1000 ? 'var(--amber)' : 'var(--text2)' }}>
                  {r.latencyMs != null ? `${r.latencyMs}ms` : '—'}
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>{r.clientIp ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  )
}

// ─── Alert events tab ─────────────────────────────────────────────────────────

function AlertEventsTab() {
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const list = trpc.alerts.listEvents.useQuery({ limit: 200 }, { refetchInterval: 15_000 })

  const rows = useMemo(() => {
    return (list.data ?? []).filter(r => {
      if (search && !r.message.toLowerCase().includes(search.toLowerCase())) return false
      const t = new Date(r.firedAt).getTime()
      if (dateFrom && t < new Date(dateFrom).getTime()) return false
      if (dateTo && t > new Date(dateTo).getTime() + 86_400_000) return false
      return true
    })
  }, [list.data, search, dateFrom, dateTo])

  function exportCsv() {
    downloadCsv(
      ['fired_at', 'rule_id', 'route_id', 'message', 'detail'],
      rows.map(r => [new Date(r.firedAt).toISOString(), r.ruleId, r.routeId ?? '', r.message, typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail ?? '')]),
      'proxyos-alert-events',
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={exportCsv}>Export CSV</Button>
      </div>
      <FilterBar
        search={search} setSearch={setSearch}
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
      />
      <Card header={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Alert events
          <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{rows.length} entries</span>
        </span>
      }>
        <DataTable>
          <thead>
            <tr>
              <th style={{ ...th, width: '16%' }}>Fired at</th>
              <th style={{ ...th, width: '22%' }}>Rule</th>
              <th style={{ ...th, width: '20%' }}>Route</th>
              <th style={th}>Message</th>
              <th style={{ ...th, width: '22%' }}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: '32px 12px' }}>
                {list.isFetching ? 'Loading…' : 'No alert events.'}
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                  {new Date(r.firedAt).toLocaleString()}
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.ruleId}</td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>{r.routeId ?? '—'}</td>
                <td style={{ ...td, fontWeight: 500 }}><Badge tone="amber">{r.message}</Badge></td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {typeof r.detail === 'string' ? r.detail : r.detail ? JSON.stringify(r.detail) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  )
}

// ─── Caddy daemon logs tab ────────────────────────────────────────────────────

const CADDY_LEVEL_TONE: Record<string, BadgeTone> = { info: 'blue', warn: 'amber', error: 'red', debug: 'neutral' }
const CADDY_LEVEL_DOT: Record<string, string> = { info: 'var(--blue)', warn: 'var(--amber)', error: 'var(--red)', debug: 'var(--text3)' }

function CaddyLogsTab() {
  const [level, setLevel] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const list = trpc.caddyLogs.list.useQuery(
    { limit: 200, level: level as '' | 'info' | 'warn' | 'error' | undefined, search: search || undefined },
    { refetchInterval: 8_000 },
  )
  const rows = list.data ?? []

  function toggleExpand(ts: number) {
    setExpanded(prev => { const n = new Set(prev); if (n.has(ts)) n.delete(ts); else n.add(ts); return n })
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {(['info', 'warn', 'error'] as const).map(l => (
          <button
            key={l}
            onClick={() => setLevel(prev => prev === l ? '' : l)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
              borderRadius: 6, border: `1px solid ${level === l ? CADDY_LEVEL_DOT[l] : 'var(--border2)'}`,
              background: level === l ? `color-mix(in srgb, ${CADDY_LEVEL_DOT[l]} 12%, transparent)` : 'var(--surf)',
              cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
              color: level === l ? CADDY_LEVEL_DOT[l] : 'var(--text2)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: CADDY_LEVEL_DOT[l], flexShrink: 0 }} />
            {l}
          </button>
        ))}
        <Input
          placeholder="Search message or logger…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, marginLeft: 4 }}
        />
      </div>

      <Card header={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Caddy daemon logs
          <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{rows.length} entries · live</span>
        </span>
      }>
        <DataTable>
          <thead>
            <tr>
              <th style={{ ...th, width: 28 }} />
              <th style={{ ...th, width: '14%' }}>Time</th>
              <th style={{ ...th, width: '8%' }}>Level</th>
              <th style={{ ...th, width: '18%' }}>Logger</th>
              <th style={th}>Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: '32px 12px' }}>
                {list.isFetching ? 'Loading…' : 'No Caddy logs yet — logs appear after the first restart with the new config.'}
              </td></tr>
            )}
            {rows.map((r) => (
              <Fragment key={r.ts}>
                <tr
                  style={{ cursor: r.detail ? 'pointer' : 'default', borderLeft: `2px solid ${CADDY_LEVEL_DOT[r.level] ?? 'var(--border)'}` }}
                  onClick={() => r.detail && toggleExpand(r.ts)}
                >
                  <td style={{ ...td, color: 'var(--text3)', fontSize: 10 }}>{r.detail ? (expanded.has(r.ts) ? '▾' : '▸') : ''}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    {new Date(r.ts * 1000).toLocaleString()}
                  </td>
                  <td style={td}><Badge tone={CADDY_LEVEL_TONE[r.level] ?? 'neutral'}>{r.level}</Badge></td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{r.logger || '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.msg}</td>
                </tr>
                {r.detail && expanded.has(r.ts) && (
                  <tr>
                    <td colSpan={5} style={{ ...td, background: 'var(--surf2)', padding: '10px 16px' }}>
                      <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {r.detail}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'system', label: 'System logs' },
  { id: 'access', label: 'Access logs' },
  { id: 'alerts', label: 'Alert events' },
  { id: 'caddy', label: 'Caddy logs' },
]

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('system')

  return (
    <>
      <Topbar title="Logs" />
      <PageContent>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: -8 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px',
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
                fontWeight: tab === t.id ? 500 : 400,
                color: tab === t.id ? 'var(--accent-dark)' : 'var(--text3)',
                background: 'none',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid var(--accent-dark)' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'system' && <SystemLogsTab />}
        {tab === 'access' && <AccessLogsTab />}
        {tab === 'alerts' && <AlertEventsTab />}
        {tab === 'caddy' && <CaddyLogsTab />}
      </PageContent>
    </>
  )
}
