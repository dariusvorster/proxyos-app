'use client'

import { Fragment, useMemo, useState } from 'react'
import { Badge, Card, DataTable, Input, Select, td, th, type BadgeTone } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

// ─── Types ────────────────────────────────────────────────────────────────────

type OpStatus = 'in_progress' | 'success' | 'error'
type StepStatus = 'info' | 'success' | 'error' | 'warning'

interface OperationStep {
  ts: number
  message: string
  status: StepStatus
}

// ─── Styling ──────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<OpStatus, BadgeTone> = {
  in_progress: 'blue',
  success: 'green',
  error: 'red',
}

const STEP_COLOR: Record<StepStatus, string> = {
  info: 'var(--blue)',
  success: 'var(--green)',
  error: 'var(--red)',
  warning: 'var(--amber)',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const diff = Date.now() - new Date(date).getTime()
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(date).toLocaleDateString()
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatStepTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// ─── Expanded step log ────────────────────────────────────────────────────────

function StepLog({ operationId }: { operationId: string }) {
  const { data, isLoading } = trpc.operationLogs.get.useQuery({ id: operationId })

  if (isLoading) {
    return (
      <tr>
        <td colSpan={6} style={{ ...td, background: 'var(--surf2)', padding: '10px 16px', color: 'var(--text3)', fontSize: 11 }}>
          Loading steps…
        </td>
      </tr>
    )
  }

  const steps: OperationStep[] = data?.steps ?? []

  return (
    <tr>
      <td colSpan={6} style={{ ...td, background: 'var(--surf2)', padding: '10px 16px' }}>
        {steps.length === 0 ? (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>No steps recorded.</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ color: 'var(--text3)', flexShrink: 0, minWidth: 56 }}>{formatStepTime(s.ts)}</span>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: STEP_COLOR[s.status as StepStatus] ?? 'var(--text3)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: 'var(--text)' }}>{s.message}</span>
              </div>
            ))}
          </div>
        )}
        {data?.error && (
          <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)' }}>
            Error: {data.error}
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperationsLogPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const list = trpc.operationLogs.list.useQuery(
    {
      limit: 200,
      status: statusFilter || undefined,
      type: typeFilter || undefined,
    },
    { refetchInterval: 5_000 },
  )

  const rows = useMemo(() => {
    const all = list.data ?? []
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter(r =>
      r.subject.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q),
    )
  }, [list.data, search])

  // Collect unique types for the filter dropdown
  const types = useMemo(() => {
    const set = new Set((list.data ?? []).map(r => r.type))
    return Array.from(set).sort()
  }, [list.data])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <>
      <Topbar title="Operations log" />
      <PageContent>
        {/* Filter bar */}
        <Card>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input
              placeholder="Search subject or type…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            />
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="in_progress">In progress</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
            </Select>
            <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
        </Card>

        {/* Table */}
        <Card header={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Operations
            <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{rows.length} entries</span>
          </span>
        }>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: 28 }} />
                <th style={{ ...th, width: '14%' }}>Time</th>
                <th style={{ ...th, width: '14%' }}>Type</th>
                <th style={th}>Subject</th>
                <th style={{ ...th, width: '10%' }}>Duration</th>
                <th style={{ ...th, width: '11%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: '32px 12px' }}>
                    {list.isFetching ? 'Loading…' : 'No operations.'}
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <Fragment key={r.id}>
                  <tr
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleExpand(r.id)}
                  >
                    <td style={{ ...td, color: 'var(--text3)', fontSize: 10 }}>
                      {expanded.has(r.id) ? '▾' : '▸'}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {relativeTime(r.createdAt)}
                    </td>
                    <td style={td}>
                      <Badge tone="neutral">{r.type}</Badge>
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.subject}</td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
                      {formatDuration(r.durationMs)}
                    </td>
                    <td style={td}>
                      <Badge tone={STATUS_TONE[r.status as OpStatus] ?? 'neutral'}>
                        {r.status === 'in_progress' ? 'in progress' : r.status}
                      </Badge>
                    </td>
                  </tr>
                  {expanded.has(r.id) && <StepLog operationId={r.id} />}
                </Fragment>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}
