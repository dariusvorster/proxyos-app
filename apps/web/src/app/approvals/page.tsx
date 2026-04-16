'use client'

import { useState } from 'react'
import { Badge, Button, Card, DataTable, Input, Toggle, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function ApprovalsPage() {
  const utils = trpc.useUtils()
  const config = trpc.approvals.getConfig.useQuery()
  const list = trpc.approvals.list.useQuery({ status: 'pending' })
  const history = trpc.approvals.list.useQuery({ status: 'all' })

  const saveConfig = trpc.approvals.setConfig.useMutation({ onSuccess: () => utils.approvals.getConfig.invalidate() })
  const approve = trpc.approvals.approve.useMutation({ onSuccess: () => { utils.approvals.list.invalidate() } })
  const reject = trpc.approvals.reject.useMutation({ onSuccess: () => { utils.approvals.list.invalidate() } })
  const purge = trpc.approvals.purgeExpired.useMutation({ onSuccess: () => utils.approvals.list.invalidate() })

  const [enabled, setEnabled] = useState(config.data?.enabled ?? false)
  const [approvers, setApprovers] = useState(config.data?.requiredApprovers?.toString() ?? '1')
  const [timeout, setTimeout_] = useState(config.data?.timeout?.toString() ?? '60')

  // In a real implementation this would come from session — stub as admin
  const ACTING_USER = 'system-admin'

  function statusTone(s: string): 'green' | 'red' | 'amber' | 'neutral' {
    if (s === 'approved') return 'green'
    if (s === 'rejected') return 'red'
    if (s === 'pending') return 'amber'
    return 'neutral'
  }

  return (
    <>
      <Topbar title="Change approvals" />
      <PageContent>
        <Card header={<span>Approval config</span>} style={{ marginBottom: 8 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Require approvals</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Operator changes create pending requests instead of applying immediately</div>
              </div>
              <Toggle checked={enabled} onChange={setEnabled} />
            </div>
            {enabled && (
              <>
                <Field label="Required approvers">
                  <Input type="number" value={approvers} onChange={e => setApprovers(e.target.value)} style={{ width: 80 }} />
                </Field>
                <Field label="Timeout (minutes)">
                  <Input type="number" value={timeout} onChange={e => setTimeout_(e.target.value)} style={{ width: 80 }} />
                </Field>
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={() => saveConfig.mutate({ enabled, requiredApprovers: Number(approvers), timeout: Number(timeout), exemptRoles: ['admin'], exemptActions: [] })} disabled={saveConfig.isPending}>Save</Button>
              <Button onClick={() => purge.mutate()} disabled={purge.isPending}>Purge expired</Button>
            </div>
          </div>
        </Card>

        <Card header={<span>Pending ({list.data?.length ?? 0})</span>} style={{ marginBottom: 8 }}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '20%' }}>Action</th>
                <th style={{ ...th, width: '30%' }}>Detail</th>
                <th style={{ ...th, width: '20%' }}>Requested by</th>
                <th style={{ ...th, width: '18%' }}>At</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {list.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No pending changes.</td></tr>
              )}
              {list.data?.map(c => (
                <tr key={c.id}>
                  <td style={td}><Badge tone="amber">{c.action}</Badge></td>
                  <td style={{ ...td, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {Object.entries(c.payload).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                  </td>
                  <td style={{ ...td, fontSize: 11 }}>{c.requestedBy}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)' }}>{new Date(c.requestedAt).toLocaleString()}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" variant="primary" onClick={() => approve.mutate({ id: c.id, approvedBy: ACTING_USER })} disabled={approve.isPending}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => reject.mutate({ id: c.id, approvedBy: ACTING_USER })} disabled={reject.isPending}>Reject</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card header={<span>History</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '18%' }}>Action</th>
                <th style={{ ...th, width: '12%' }}>Status</th>
                <th style={{ ...th, width: '22%' }}>Requested by</th>
                <th style={{ ...th, width: '22%' }}>Approved by</th>
                <th style={{ ...th, width: '26%' }}>At</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.filter(c => c.status !== 'pending').map(c => (
                <tr key={c.id}>
                  <td style={td}><Badge tone="neutral">{c.action}</Badge></td>
                  <td style={td}><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td style={{ ...td, fontSize: 11 }}>{c.requestedBy}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)' }}>{c.approvedBy ?? '—'}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)' }}>{c.approvedAt ? new Date(c.approvedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {children}
    </label>
  )
}
