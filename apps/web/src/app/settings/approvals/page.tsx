'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, DataTable, td, th, Toggle } from '~/components/ui'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

const ROLES = ['admin', 'operator', 'viewer'] as const

export default function ApprovalsPage() {
  const utils = trpc.useUtils()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [actionErr, setActionErr] = useState('')

  const list = trpc.approvals.list.useQuery({ status: statusFilter }, { refetchInterval: 10_000 })
  const config = trpc.approvals.getConfig.useQuery()

  const [cfgEnabled, setCfgEnabled] = useState(false)
  const [cfgApprovers, setCfgApprovers] = useState(1)
  const [cfgTimeout, setCfgTimeout] = useState(60)
  const [cfgExemptRoles, setCfgExemptRoles] = useState<string[]>(['admin'])

  const [cfgInit, setCfgInit] = useState(false)
  if (config.data && !cfgInit) {
    setCfgEnabled(config.data.enabled)
    setCfgApprovers(config.data.requiredApprovers)
    setCfgTimeout(config.data.timeout)
    setCfgExemptRoles(config.data.exemptRoles)
    setCfgInit(true)
  }

  const saveConfig = trpc.approvals.setConfig.useMutation({
    onSuccess: () => utils.approvals.getConfig.invalidate(),
  })

  const approve = trpc.approvals.approve.useMutation({
    onSuccess: () => { setActionErr(''); utils.approvals.list.invalidate() },
    onError: (e) => setActionErr(e.message),
  })
  const reject = trpc.approvals.reject.useMutation({
    onSuccess: () => { setActionErr(''); utils.approvals.list.invalidate() },
    onError: (e) => setActionErr(e.message),
  })
  const purge = trpc.approvals.purgeExpired.useMutation({
    onSuccess: () => utils.approvals.list.invalidate(),
  })

  const pending = list.data?.filter(r => r.status === 'pending').length ?? 0

  return (
    <>
      <Topbar
        title="Change approvals"
        actions={<Link href="/settings" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Settings</Link>}
      />
      <PageContent>
        <PageHeader
          title="Change approvals"
          desc="Require operator approval before sensitive changes are applied."
        />

        {/* Config */}
        <Card header={<span>Approval policy</span>}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Require approvals</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                  Changes submitted by operators will queue for admin review
                </div>
              </div>
              <Toggle checked={cfgEnabled} onChange={setCfgEnabled} />
            </div>

            {cfgEnabled && (
              <>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Required approvers</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={cfgApprovers}
                    onChange={e => setCfgApprovers(Number(e.target.value))}
                    style={{ width: 80, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px' }}
                  />
                </label>

                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Timeout (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={cfgTimeout}
                    onChange={e => setCfgTimeout(Number(e.target.value))}
                    style={{ width: 100, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px' }}
                  />
                </label>

                <div style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Exempt roles (no approval needed)</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {ROLES.map(role => (
                      <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={cfgExemptRoles.includes(role)}
                          onChange={e => {
                            if (e.target.checked) setCfgExemptRoles(r => [...r, role])
                            else setCfgExemptRoles(r => r.filter(x => x !== role))
                          }}
                        />
                        {role}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Button
              variant="primary"
              onClick={() => saveConfig.mutate({ enabled: cfgEnabled, requiredApprovers: cfgApprovers, timeout: cfgTimeout, exemptRoles: cfgExemptRoles as ('admin' | 'operator' | 'viewer')[], exemptActions: config.data?.exemptActions ?? [] })}
              disabled={saveConfig.isPending}
            >
              {saveConfig.isPending ? 'Saving…' : 'Save policy'}
            </Button>
          </div>
        </Card>

        {/* Queue */}
        <Card
          header={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>
                Change queue
                {pending > 0 && <Badge tone="amber" style={{ marginLeft: 8 }}>{pending} pending</Badge>}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{ padding: '2px 10px', borderRadius: 4, border: `1px solid ${statusFilter === s ? 'var(--pu-400)' : 'var(--border)'}`, background: statusFilter === s ? 'var(--pu-400)' : 'transparent', color: statusFilter === s ? '#fff' : 'var(--text-primary)', fontSize: 11, cursor: 'pointer' }}
                  >
                    {s}
                  </button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => purge.mutate()} disabled={purge.isPending}>
                  {purge.isPending ? '…' : 'Purge expired'}
                </Button>
              </div>
            </div>
          }
        >
          {actionErr && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>{actionErr}</div>}
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '22%' }}>Action</th>
                <th style={{ ...th, width: '28%' }}>Payload</th>
                <th style={{ ...th, width: '16%' }}>Requested by</th>
                <th style={{ ...th, width: '14%' }}>Requested at</th>
                <th style={{ ...th, width: '10%' }}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {list.data?.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>
                    No changes{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}.
                  </td>
                </tr>
              )}
              {list.data?.map(row => (
                <tr key={row.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.action}</td>
                  <td style={{ ...td, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(row.payload)}
                  </td>
                  <td style={{ ...td, fontSize: 11 }}>{row.requestedBy}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)' }}>{new Date(row.requestedAt).toLocaleString()}</td>
                  <td style={td}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {row.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => approve.mutate({ id: row.id, approvedBy: 'current-user' })}
                          disabled={approve.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => reject.mutate({ id: row.id, approvedBy: 'current-user' })}
                          disabled={reject.isPending}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                    {row.status !== 'pending' && row.approvedBy && (
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>by {row.approvedBy}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const tone = status === 'approved' ? 'green' : status === 'rejected' ? 'red' : 'amber'
  return <Badge tone={tone}>{status}</Badge>
}
