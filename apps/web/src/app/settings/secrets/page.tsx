'use client'

import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card, DataTable, td, th } from '~/components/ui'
import { trpc } from '~/lib/trpc'

const TYPE_LABELS: Record<string, string> = {
  lockboxos: 'LockBoxOS',
  vault: 'HashiCorp Vault',
  env: 'Environment variables',
}

const TYPE_FIELDS: Record<string, Array<{ key: string; label: string; secret?: boolean }>> = {
  lockboxos: [
    { key: 'url', label: 'LockBoxOS URL' },
    { key: 'apiKey', label: 'API Key', secret: true },
  ],
  vault: [
    { key: 'url', label: 'Vault URL' },
    { key: 'token', label: 'Token', secret: true },
    { key: 'mount', label: 'Mount path (default: secret)' },
  ],
  env: [],
}

export default function SecretsPage() {
  const providers = trpc.secretsProviders.list.useQuery()
  const createMut = trpc.secretsProviders.create.useMutation({ onSuccess: () => { providers.refetch(); resetForm() } })
  const deleteMut = trpc.secretsProviders.delete.useMutation({ onSuccess: () => providers.refetch() })
  const testMut = trpc.secretsProviders.test.useMutation({ onSuccess: () => providers.refetch() })

  const [showForm, setForm] = useState(false)
  const [type, setType] = useState<'lockboxos' | 'vault' | 'env'>('lockboxos')
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, string>>({})

  function resetForm() { setForm(false); setName(''); setConfig({}); setType('lockboxos') }

  return (
    <>
      <Topbar title="Secrets" actions={<Button variant="primary" onClick={() => setForm(true)}>+ Add provider</Button>} />
      <PageContent>
        <PageHeader
          title="Secrets providers"
          desc="Connect ProxyOS to a secrets backend. Credentials can be pulled at runtime — no secrets stored in plaintext route config."
        />

        {showForm && (
          <Card header={<span>New secrets provider</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Provider type</div>
                  <select value={type} onChange={e => { setType(e.target.value as typeof type); setConfig({}) }}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Name</div>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder={TYPE_LABELS[type]}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
                {TYPE_FIELDS[type]?.map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{f.label}</div>
                    <input
                      type={f.secret ? 'password' : 'text'}
                      value={config[f.key] ?? ''}
                      onChange={e => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
                    />
                  </div>
                ))}
                {type === 'env' && (
                  <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', padding: '6px 8px', borderRadius: 4 }}>
                    Secrets are read directly from process environment variables. No credentials required.
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary"
                  onClick={() => createMut.mutate({ type, name: name || TYPE_LABELS[type] || type, config })}
                  disabled={!name || createMut.isPending}>
                  {createMut.isPending ? 'Adding…' : 'Add provider'}
                </Button>
                <Button variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>Secrets providers ({providers.data?.length ?? 0})</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Name</th>
                <th style={{ ...th, width: '20%' }}>Type</th>
                <th style={{ ...th, width: '15%' }}>Status</th>
                <th style={{ ...th, width: '20%' }}>Last tested</th>
                <th style={{ ...th, width: '15%' }}></th>
              </tr>
            </thead>
            <tbody>
              {providers.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No secrets providers.</td></tr>
              )}
              {providers.data?.map(p => (
                <tr key={p.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{p.name}</td>
                  <td style={td}><Badge tone="purple">{TYPE_LABELS[p.type] ?? p.type}</Badge></td>
                  <td style={td}>
                    <Badge tone={p.testStatus === 'ok' ? 'green' : p.testStatus === 'error' ? 'red' : 'neutral'}>{p.testStatus}</Badge>
                  </td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text2)' }}>{p.lastTestedAt ? new Date(p.lastTestedAt).toLocaleString() : '—'}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => testMut.mutate({ id: p.id })} disabled={testMut.isPending}>
                        Test
                      </Button>
                      <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}
                        onClick={() => { if (confirm('Delete provider?')) deleteMut.mutate({ id: p.id }) }}>
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
