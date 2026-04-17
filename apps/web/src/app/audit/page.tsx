'use client'

import { useMemo, useState } from 'react'
import { Badge, Button, Card, DataTable, Input, Select, td, th, type BadgeTone } from '~/components/ui'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { trpc } from '~/lib/trpc'

const ACTION_TONE: Record<string, BadgeTone> = {
  'route.create': 'green',
  'route.expose': 'green',
  'route.update': 'purple',
  'route.delete': 'red',
  'sso.create': 'purple',
  'sso.delete': 'red',
  'dns.create': 'purple',
  'dns.delete': 'red',
  'alert.create': 'purple',
  'alert.delete': 'red',
  'cert.renewed': 'green',
  'cert.expiring': 'amber',
  'agent.registered': 'green',
  'agent.offline': 'amber',
  'agent.token_revoked': 'red',
  'import.completed': 'green',
}

export default function AuditPage() {
  const [filter, setFilter] = useState('')
  const [actionQuery, setActionQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const list = trpc.audit.list.useQuery({ resourceType: filter || undefined, limit: 500 }, { refetchInterval: 10_000 })

  const rows = useMemo(() => {
    return (list.data ?? []).filter((e) => {
      if (actionQuery && !e.action.toLowerCase().includes(actionQuery.toLowerCase()) && !(e.resourceName ?? '').toLowerCase().includes(actionQuery.toLowerCase())) return false
      const t = new Date(e.createdAt).getTime()
      if (dateFrom && t < new Date(dateFrom).getTime()) return false
      if (dateTo && t > new Date(dateTo).getTime() + 86_400_000) return false
      return true
    })
  }, [list.data, actionQuery, dateFrom, dateTo])

  function exportCsv() {
    const header = ['timestamp', 'action', 'resource_type', 'resource_id', 'resource_name', 'actor', 'detail']
    const lines = [header.join(',')]
    for (const e of rows) {
      const cells = [
        new Date(e.createdAt).toISOString(),
        e.action, e.resourceType, e.resourceId ?? '', e.resourceName ?? '', e.actor,
        JSON.stringify(e.detail ?? {}),
      ].map(csvEscape)
      lines.push(cells.join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `proxyos-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <Topbar
        title="Audit log"
        actions={<Button onClick={exportCsv}>Export CSV</Button>}
      />
      <PageContent>
        <PageHeader title="Audit Log" desc="All configuration changes and system events on this instance." />
        <Card>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All resources</option>
              <option value="route">Routes</option>
              <option value="sso_provider">SSO providers</option>
              <option value="dns_provider">DNS providers</option>
              <option value="alert_rule">Alert rules</option>
            </Select>
            <Input placeholder="Search action or name…" value={actionQuery} onChange={(e) => setActionQuery(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span style={{ color: 'var(--text-dim)', fontSize: 11, alignSelf: 'center' }}>→</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11, color: 'var(--text-dim)' }}>{rows.length} events</span>
          </div>
        </Card>

        <Card header={<span>Events</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: 28 }}></th>
                <th style={{ ...th, width: '16%' }}>When</th>
                <th style={{ ...th, width: '18%' }}>Action</th>
                <th style={{ ...th, width: '30%' }}>Subject</th>
                <th style={{ ...th, width: '10%' }}>Actor</th>
                <th style={{ ...th, width: '22%' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No events.</td></tr>
              )}
              {rows.map((e) => {
                const isOpen = expanded.has(e.id)
                return (
                  <>
                    <tr
                      key={e.id}
                      onClick={() => {
                        setExpanded((prev) => {
                          const next = new Set(prev)
                          if (next.has(e.id)) next.delete(e.id); else next.add(e.id)
                          return next
                        })
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ ...td, color: 'var(--text-dim)' }}>{isOpen ? '▾' : '▸'}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{new Date(e.createdAt).toLocaleString()}</td>
                      <td style={td}><Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>{e.action}</Badge></td>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{e.resourceName ?? '—'}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{e.resourceType}</div>
                      </td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>{e.actor}</td>
                      <td style={{ ...td, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.detail ? JSON.stringify(e.detail) : '—'}
                      </td>
                    </tr>
                    {isOpen && e.detail && (
                      <tr key={`${e.id}-detail`}>
                        <td colSpan={6} style={{ ...td, background: 'rgba(124,111,240,0.04)', padding: '10px 12px' }}>
                          <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{JSON.stringify(e.detail, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}

function csvEscape(v: string): string {
  if (v.includes('"') || v.includes(',') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}
