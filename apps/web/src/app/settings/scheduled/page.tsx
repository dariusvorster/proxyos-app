'use client'

import { useEffect, useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card, DataTable, td, th } from '~/components/ui'
import { trpc } from '~/lib/trpc'

const ACTION_LABELS: Record<string, string> = {
  enable: 'Enable route',
  disable: 'Disable route',
  update_upstream: 'Update upstream',
  rollback: 'Rollback config',
}

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'neutral'> = {
  pending: 'amber',
  done: 'green',
  failed: 'red',
  cancelled: 'neutral',
}

export default function ScheduledPage() {
  const pending = trpc.scheduledChanges.listPending.useQuery()
  const routes = trpc.routes.list.useQuery()
  const cancelMut = trpc.scheduledChanges.cancel.useMutation({ onSuccess: () => pending.refetch() })
  const createMut = trpc.scheduledChanges.create.useMutation({ onSuccess: () => { pending.refetch(); resetForm() } })
  const executeDue = trpc.scheduledChanges.executeDue.useMutation({ onSuccess: () => pending.refetch() })

  useEffect(() => {
    executeDue.mutate()
    const t = setInterval(() => executeDue.mutate(), 60_000)
    return () => clearInterval(t)
  }, [])

  const [showForm, setForm] = useState(false)
  const [routeId, setRouteId] = useState('')
  const [action, setAction] = useState<'enable' | 'disable' | 'update_upstream' | 'rollback'>('disable')
  const [scheduledAt, setScheduledAt] = useState('')
  const [newUpstream, setNewUpstream] = useState('')

  function resetForm() { setForm(false); setRouteId(''); setAction('disable'); setScheduledAt(''); setNewUpstream('') }

  const payload = action === 'update_upstream' && newUpstream
    ? { upstreams: JSON.stringify([{ address: newUpstream }]) }
    : null

  return (
    <>
      <Topbar title="Scheduled changes" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => executeDue.mutate()} disabled={executeDue.isPending}>
            {executeDue.isPending ? 'Running…' : 'Run due'}
          </Button>
          <Button variant="primary" onClick={() => setForm(true)}>+ Schedule change</Button>
        </div>
      } />
      <PageContent>
        <PageHeader
          title="Scheduled route changes"
          desc="Automate route enable/disable windows, upstream swaps, or rollbacks at a specific date and time."
        />

        {showForm && (
          <Card header={<span>New scheduled change</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Route</div>
                  <select value={routeId} onChange={e => setRouteId(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    <option value="">Select route…</option>
                    {routes.data?.map(r => <option key={r.id} value={r.id}>{r.domain}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Action</div>
                  <select value={action} onChange={e => setAction(e.target.value as typeof action)}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Execute at</div>
                  <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
                {action === 'update_upstream' && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>New upstream address</div>
                    <input value={newUpstream} onChange={e => setNewUpstream(e.target.value)} placeholder="host:port"
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary"
                  onClick={() => createMut.mutate({
                    routeId,
                    action,
                    payload,
                    scheduledAt: new Date(scheduledAt).toISOString(),
                  })}
                  disabled={!routeId || !scheduledAt || createMut.isPending}>
                  {createMut.isPending ? 'Scheduling…' : 'Schedule'}
                </Button>
                <Button variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>Pending changes ({pending.data?.length ?? 0})</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Route</th>
                <th style={{ ...th, width: '20%' }}>Action</th>
                <th style={{ ...th, width: '20%' }}>Scheduled for</th>
                <th style={{ ...th, width: '15%' }}>Status</th>
                <th style={{ ...th, width: '15%' }}></th>
              </tr>
            </thead>
            <tbody>
              {pending.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No pending changes.</td></tr>
              )}
              {pending.data?.map(c => {
                const route = routes.data?.find(r => r.id === c.routeId)
                return (
                  <tr key={c.id}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{route?.domain ?? c.routeId}</td>
                    <td style={td}><Badge tone="neutral">{ACTION_LABELS[c.action] ?? c.action}</Badge></td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text2)' }}>{new Date(c.scheduledAt).toLocaleString()}</td>
                    <td style={td}><Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Badge></td>
                    <td style={td}>
                      {c.status === 'pending' && (
                        <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}
                          onClick={() => cancelMut.mutate({ id: c.id })}>
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}
