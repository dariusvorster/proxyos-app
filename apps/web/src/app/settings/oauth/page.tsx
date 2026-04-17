'use client'

import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card, DataTable, td, th } from '~/components/ui'
import { trpc } from '~/lib/trpc'

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  google: 'Google',
  microsoft: 'Microsoft',
  oidc: 'Generic OIDC',
}

const PROVIDER_HINTS: Record<string, string> = {
  github: 'Create an OAuth App at github.com/settings/developers',
  google: 'Create credentials at console.cloud.google.com',
  microsoft: 'Register an app at portal.azure.com',
  oidc: 'Provide the OIDC discovery URL from your identity provider',
}

export default function OAuthPage() {
  const providers = trpc.oauthProviders.list.useQuery()
  const createMut = trpc.oauthProviders.create.useMutation({ onSuccess: () => { providers.refetch(); setForm(false) } })
  const deleteMut = trpc.oauthProviders.delete.useMutation({ onSuccess: () => providers.refetch() })

  const [showForm, setForm] = useState(false)
  const [type, setType] = useState<'github' | 'google' | 'microsoft' | 'oidc'>('github')
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [discoveryUrl, setDiscoveryUrl] = useState('')
  const [allowedDomains, setAllowedDomains] = useState('')

  return (
    <>
      <Topbar title="OAuth" actions={<Button variant="primary" onClick={() => setForm(true)}>+ Add provider</Button>} />
      <PageContent>
        <PageHeader title="OAuth2 providers" desc="Gate routes behind GitHub, Google, Microsoft, or any OIDC identity provider — no separate IDP required." />

        {showForm && (
          <Card header={<span>New OAuth provider</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Provider</div>
                  <select value={type} onChange={e => setType(e.target.value as typeof type)}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}>
                    {Object.entries(PROVIDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Display name</div>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder={PROVIDER_LABELS[type]}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Client ID</div>
                  <input value={clientId} onChange={e => setClientId(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Client secret</div>
                  <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
                {type === 'oidc' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>OIDC discovery URL</div>
                    <input value={discoveryUrl} onChange={e => setDiscoveryUrl(e.target.value)} placeholder="https://sso.example.com/.well-known/openid-configuration"
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                  </div>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Allowed email domains (optional, comma-separated)</div>
                  <input value={allowedDomains} onChange={e => setAllowedDomains(e.target.value)} placeholder="example.com, company.org"
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', padding: '6px 8px', borderRadius: 4 }}>
                {PROVIDER_HINTS[type]}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary"
                  onClick={() => createMut.mutate({
                    type, name: name || PROVIDER_LABELS[type] || type, clientId, clientSecret,
                    oidcDiscoveryUrl: type === 'oidc' ? discoveryUrl : undefined,
                    allowedDomains: allowedDomains ? allowedDomains.split(',').map(d => d.trim()).filter(Boolean) : undefined,
                  })}
                  disabled={!clientId || !clientSecret || (type === 'oidc' && !discoveryUrl) || createMut.isPending}>
                  {createMut.isPending ? 'Adding…' : 'Add provider'}
                </Button>
                <Button variant="ghost" onClick={() => setForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>OAuth providers ({providers.data?.length ?? 0})</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Name</th>
                <th style={{ ...th, width: '15%' }}>Type</th>
                <th style={{ ...th, width: '25%' }}>Client ID</th>
                <th style={{ ...th, width: '15%' }}>Status</th>
                <th style={{ ...th, width: '15%' }}></th>
              </tr>
            </thead>
            <tbody>
              {providers.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No OAuth providers.</td></tr>
              )}
              {providers.data?.map(p => (
                <tr key={p.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{p.name}</td>
                  <td style={td}><Badge tone="purple">{PROVIDER_LABELS[p.type] ?? p.type}</Badge></td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>{p.clientId}</td>
                  <td style={td}><Badge tone={p.enabled ? 'green' : 'neutral'}>{p.enabled ? 'enabled' : 'disabled'}</Badge></td>
                  <td style={td}>
                    <Button variant="ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--red)' }}
                      onClick={() => { if (confirm('Delete provider?')) deleteMut.mutate({ id: p.id }) }}>
                      Delete
                    </Button>
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
