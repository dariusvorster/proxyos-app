'use client'

import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card, DataTable, td, th } from '~/components/ui'
import { trpc } from '~/lib/trpc'

export default function TunnelsPage() {
  const providers = trpc.tunnelProviders.list.useQuery()
  const createMut = trpc.tunnelProviders.create.useMutation({ onSuccess: () => { providers.refetch(); setForm(false) } })
  const deleteMut = trpc.tunnelProviders.delete.useMutation({ onSuccess: () => providers.refetch() })
  const testMut = trpc.tunnelProviders.test.useMutation({ onSuccess: () => providers.refetch() })

  const [showForm, setForm] = useState(false)
  const [type, setType] = useState<'cloudflare' | 'tailscale' | 'ngrok'>('cloudflare')
  const [name, setName] = useState('')
  const [creds, setCreds] = useState<Record<string, string>>({})

  const credField = (key: string, label: string, inputType = 'text') => (
    <div key={key}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
      <input type={inputType} value={creds[key] ?? ''} onChange={e => setCreds(prev => ({ ...prev, [key]: e.target.value }))}
        style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
    </div>
  )

  return (
    <>
      <Topbar title="Tunnels" actions={<Button variant="primary" onClick={() => setForm(true)}>+ Add tunnel provider</Button>} />
      <PageContent>
        <PageHeader title="Tunnel providers" desc="Expose services via Cloudflare Tunnel, Tailscale Funnel, or ngrok — no port forwarding required." />

        {showForm && (
          <Card header={<span>New tunnel provider</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Provider type</div>
                  <select value={type} onChange={e => { setType(e.target.value as typeof type); setCreds({}) }}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    <option value="cloudflare">Cloudflare Tunnel</option>
                    <option value="tailscale">Tailscale Funnel</option>
                    <option value="ngrok">ngrok</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Name</div>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="My tunnel"
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
                {type === 'cloudflare' && (
                  <>
                    {credField('accountId', 'Account ID')}
                    {credField('apiToken', 'API Token', 'password')}
                  </>
                )}
                {type === 'tailscale' && credField('authKey', 'Auth Key', 'password')}
                {type === 'ngrok' && (
                  <>
                    {credField('authToken', 'Auth Token', 'password')}
                    {credField('reservedDomain', 'Reserved domain (optional)')}
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary"
                  onClick={() => createMut.mutate({ type, name, credentials: creds })}
                  disabled={!name || createMut.isPending}>
                  {createMut.isPending ? 'Adding…' : 'Add provider'}
                </Button>
                <Button variant="ghost" onClick={() => setForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>Configured providers</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Name</th>
                <th style={{ ...th, width: '15%' }}>Type</th>
                <th style={{ ...th, width: '20%' }}>Status</th>
                <th style={{ ...th, width: '20%' }}>Last tested</th>
                <th style={{ ...th, width: '15%' }}></th>
              </tr>
            </thead>
            <tbody>
              {providers.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No tunnel providers.</td></tr>
              )}
              {providers.data?.map(p => (
                <tr key={p.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{p.name}</td>
                  <td style={td}><Badge tone="neutral">{p.type}</Badge></td>
                  <td style={td}>
                    <Badge tone={p.status === 'connected' ? 'green' : p.status === 'error' ? 'red' : 'neutral'}>{p.status}</Badge>
                  </td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text2)' }}>{p.lastTestedAt ? new Date(p.lastTestedAt).toLocaleString() : '—'}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => testMut.mutate({ id: p.id })} disabled={testMut.isPending}>
                        Test
                      </Button>
                      <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}
                        onClick={() => { if (confirm('Delete?')) deleteMut.mutate({ id: p.id }) }}>
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
