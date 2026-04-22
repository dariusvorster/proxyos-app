'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertBanner, Badge, Button, Card, DataTable, Input, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

const SCOPES = ['read', 'routes', 'agents', 'connections', 'admin'] as const
type Scope = typeof SCOPES[number]

const SCOPE_DESC: Record<Scope, string> = {
  read: 'GET endpoints only',
  routes: 'Route CRUD',
  agents: 'Agent management',
  connections: 'Connection management',
  admin: 'All operations + settings',
}

export default function ApiKeysPage() {
  const [handleError] = useErrorHandler()
  const utils = trpc.useUtils()
  const list = trpc.apiKeys.list.useQuery()
  const create = trpc.apiKeys.create.useMutation({
    onSuccess: data => { utils.apiKeys.list.invalidate(); setNewKey(data.key); setShowForm(false); setName(''); setScopes([]); setExpiry('') },
    onError: handleError,
  })
  const revoke = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => utils.apiKeys.list.invalidate(),
    onError: handleError,
  })

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>([])
  const [expiry, setExpiry] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)

  function toggleScope(s: Scope) {
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  return (
    <>
      <Topbar
        title="API keys"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href="/settings" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Settings</Link>
            <Button variant="primary" onClick={() => { setShowForm(v => !v); setNewKey(null) }}>+ New key</Button>
          </div>
        }
      />
      <PageContent>
        {newKey && (
          <div style={{ marginBottom: 8 }}>
            <AlertBanner tone="amber">
              Copy this key now — it will not be shown again.
            </AlertBanner>
            <div style={{ marginTop: 6, background: 'var(--surface-2)', borderRadius: 4, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>
              {newKey}
            </div>
          </div>
        )}

        {showForm && (
          <Card header={<span>Create API key</span>} style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="Name">
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="CI pipeline key" />
              </Field>
              <Field label="Scopes">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SCOPES.map(s => (
                    <button key={s} onClick={() => s === 'admin' ? setScopes(['admin']) : toggleScope(s)}
                      style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${scopes.includes(s) ? 'var(--pu-400)' : 'var(--border)'}`, background: scopes.includes(s) ? 'var(--pu-400)' : 'transparent', color: scopes.includes(s) ? '#fff' : 'var(--text-primary)', fontSize: 11, cursor: 'pointer' }}
                      title={SCOPE_DESC[s]}>
                      {s}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                  {scopes.map(s => SCOPE_DESC[s]).join(' · ') || 'Select at least one scope'}
                </div>
              </Field>
              <Field label="Expires in (days, optional)">
                <Input type="number" value={expiry} onChange={e => setExpiry(e.target.value)} placeholder="Never" />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={() => create.mutate({ name, scopes: scopes.includes('admin') ? ['admin'] : scopes, expiresInDays: expiry ? Number(expiry) : undefined })} disabled={!name || scopes.length === 0 || create.isPending}>
                  Create
                </Button>
                <Button onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>API keys</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '25%' }}>Name</th>
                <th style={{ ...th, width: '25%' }}>Scopes</th>
                <th style={{ ...th, width: '20%' }}>Last used</th>
                <th style={{ ...th, width: '20%' }}>Expires</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {list.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No API keys — create one to access the REST API at <code style={{ fontFamily: 'var(--font-mono)' }}>/api/v1</code>.</td></tr>
              )}
              {list.data?.map(k => (
                <tr key={k.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{k.name}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {k.scopes.map(s => <Badge key={s} tone={s === 'admin' ? 'red' : 'neutral'}>{s}</Badge>)}
                    </div>
                  </td>
                  <td style={{ ...td, color: 'var(--text-dim)', fontSize: 11 }}>{k.lastUsed ? new Date(k.lastUsed).toLocaleString() : 'Never'}</td>
                  <td style={{ ...td, color: 'var(--text-dim)', fontSize: 11 }}>{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : '—'}</td>
                  <td style={td}>
                    <Button size="sm" variant="danger" onClick={() => revoke.mutate({ id: k.id })} disabled={revoke.isPending}>Revoke</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            REST API base URL: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>/api/v1</code>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
            {['GET /api/v1/routes', 'POST /api/v1/routes/{id}/disable', 'DELETE /api/v1/routes/{id}', 'GET /api/v1/agents', 'GET /api/v1/certificates', 'GET /api/v1/connections', 'GET /api/v1/analytics/summary', 'POST /api/v1/scanner/scan'].map(e => (
              <div key={e}>{e}</div>
            ))}
          </div>
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
