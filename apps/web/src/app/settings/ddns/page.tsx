'use client'

import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Button, Card, DataTable, td, th } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

export default function DdnsPage() {
  const [handleError] = useErrorHandler()
  const records = trpc.ddns.list.useQuery()
  const dnsProviders = trpc.dns.list.useQuery()
  const createMut = trpc.ddns.create.useMutation({ onSuccess: () => { records.refetch(); setForm(false) }, onError: handleError })
  const deleteMut = trpc.ddns.delete.useMutation({ onSuccess: () => records.refetch(), onError: handleError })
  const triggerMut = trpc.ddns.triggerUpdate.useMutation({ onSuccess: () => records.refetch(), onError: handleError })
  const detectIp = trpc.ddns.detectIp.useQuery()

  const [showForm, setForm] = useState(false)
  const [dnsProviderId, setDnsProviderId] = useState('')
  const [zone, setZone] = useState('')
  const [recordName, setRecordName] = useState('')
  const [recordType, setRecordType] = useState<'A' | 'AAAA'>('A')
  const [intervalS, setIntervalS] = useState(300)

  return (
    <>
      <Topbar
        title="DDNS"
        actions={<Button variant="primary" onClick={() => setForm(true)}>+ Add record</Button>}
      />
      <PageContent>
        <PageHeader
          title="Dynamic DNS"
          desc={`Auto-updates DNS records when your public IP changes. Detected IP: ${detectIp.data?.ip ?? '—'}`}
        />

        {showForm && (
          <Card header={<span>New DDNS record</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>DNS provider</div>
                  <select value={dnsProviderId} onChange={e => setDnsProviderId(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    <option value="">Select provider…</option>
                    {dnsProviders.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Record type</div>
                  <select value={recordType} onChange={e => setRecordType(e.target.value as 'A' | 'AAAA')}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    <option value="A">A (IPv4)</option>
                    <option value="AAAA">AAAA (IPv6)</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Zone (domain)</div>
                  <input value={zone} onChange={e => setZone(e.target.value)} placeholder="example.com"
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Record name</div>
                  <input value={recordName} onChange={e => setRecordName(e.target.value)} placeholder="home"
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Update interval (seconds)</div>
                  <input type="number" value={intervalS} onChange={e => setIntervalS(parseInt(e.target.value))} min={60} max={86400}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={() => createMut.mutate({ dnsProviderId, zone, recordName, recordType, updateIntervalS: intervalS })}
                  disabled={!dnsProviderId || !zone || !recordName || createMut.isPending}>
                  {createMut.isPending ? 'Creating…' : 'Create'}
                </Button>
                <Button variant="ghost" onClick={() => setForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>DDNS records ({records.data?.length ?? 0})</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Record</th>
                <th style={{ ...th, width: '15%' }}>Type</th>
                <th style={{ ...th, width: '20%' }}>Current IP</th>
                <th style={{ ...th, width: '20%' }}>Last updated</th>
                <th style={{ ...th, width: '15%' }}></th>
              </tr>
            </thead>
            <tbody>
              {records.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No DDNS records.</td></tr>
              )}
              {records.data?.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.recordName}.{r.zone}</td>
                  <td style={td}>{r.recordType}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>
                    {r.lastIp ?? <span style={{ color: 'var(--text3)' }}>—</span>}
                    {r.lastError && <span style={{ color: 'var(--red)', fontSize: 10, display: 'block' }}>{r.lastError}</span>}
                  </td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text2)' }}>
                    {r.lastUpdatedAt ? new Date(r.lastUpdatedAt).toLocaleString() : '—'}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => triggerMut.mutate({ id: r.id })}
                        disabled={triggerMut.isPending}>
                        Update now
                      </Button>
                      <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}
                        onClick={() => { if (confirm('Delete this record?')) deleteMut.mutate({ id: r.id }) }}>
                        Delete
                      </Button>
                    </div>
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
