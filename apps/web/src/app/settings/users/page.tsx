'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, DataTable, Input, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

const ROLES = ['admin', 'operator', 'viewer'] as const
type Role = typeof ROLES[number]

const ROLE_DESC: Record<Role, string> = {
  admin: 'Full access, settings, user management, delete',
  operator: 'Manage routes, agents, connections — no settings',
  viewer: 'Read-only — no credentials, no chain IPs',
}

export default function UsersPage() {
  const [handleError] = useErrorHandler()
  const utils = trpc.useUtils()
  const list = trpc.users.list.useQuery()
  const ssoConfig = trpc.users.getDashboardSSO.useQuery()
  const createUser = trpc.users.create.useMutation({ onSuccess: () => { utils.users.list.invalidate(); setShowForm(false); setEmail(''); setPassword('') }, onError: handleError })
  const updateRole = trpc.users.updateRole.useMutation({ onSuccess: () => utils.users.list.invalidate(), onError: handleError })
  const deleteUser = trpc.users.delete.useMutation({ onSuccess: () => utils.users.list.invalidate(), onError: handleError })
  const setSSO = trpc.users.setDashboardSSO.useMutation({ onSuccess: () => utils.users.getDashboardSSO.invalidate(), onError: handleError })
  const deleteSSO = trpc.users.deleteDashboardSSO.useMutation({ onSuccess: () => utils.users.getDashboardSSO.invalidate(), onError: handleError })

  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [showSSO, setShowSSO] = useState(false)
  const [ssoProvider, setSsoProvider] = useState<'authentik' | 'google' | 'github' | 'microsoft'>('authentik')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [allowedDomains, setAllowedDomains] = useState('')
  const [autoProvision, setAutoProvision] = useState(true)
  const [defaultRole, setDefaultRole] = useState<Role>('viewer')

  function roleTone(r: string): 'red' | 'amber' | 'neutral' {
    if (r === 'admin') return 'red'
    if (r === 'operator') return 'amber'
    return 'neutral'
  }

  return (
    <>
      <Topbar
        title="Users & roles"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href="/settings" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Settings</Link>
            <Button onClick={() => setShowSSO(v => !v)}>SSO config</Button>
            <Button variant="primary" onClick={() => setShowForm(v => !v)}>+ Add user</Button>
          </div>
        }
      />
      <PageContent>
        {showSSO && (
          <Card header={<span>Dashboard SSO</span>} style={{ marginBottom: 8 }}>
            {ssoConfig.data && (
              <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                Current: <Badge tone="green">{ssoConfig.data.provider}</Badge> — {ssoConfig.data.clientId}
                <Button size="sm" variant="danger" style={{ marginLeft: 8 }} onClick={() => deleteSSO.mutate()} disabled={deleteSSO.isPending}>Remove</Button>
              </div>
            )}
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="Provider">
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['authentik', 'google', 'github', 'microsoft'] as const).map(p => (
                    <button key={p} onClick={() => setSsoProvider(p)} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${ssoProvider === p ? 'var(--pu-400)' : 'var(--border)'}`, background: ssoProvider === p ? 'var(--pu-400)' : 'transparent', color: ssoProvider === p ? '#fff' : 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>{p}</button>
                  ))}
                </div>
              </Field>
              <Field label="Client ID"><Input value={clientId} onChange={e => setClientId(e.target.value)} /></Field>
              <Field label="Client Secret"><Input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} /></Field>
              <Field label="Allowed email domains (comma-separated, optional)"><Input value={allowedDomains} onChange={e => setAllowedDomains(e.target.value)} placeholder="homelabza.com" /></Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={() => setSSO.mutate({ provider: ssoProvider, clientId, clientSecret, allowedDomains: allowedDomains ? allowedDomains.split(',').map(d => d.trim()) : [], autoProvisionUsers: autoProvision, defaultRole })} disabled={!clientId || !clientSecret || setSSO.isPending}>Save SSO</Button>
                <Button onClick={() => setShowSSO(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        {showForm && (
          <Card header={<span>New user</span>} style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
              <Field label="Password (optional — for local login)"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
              <Field label="Role">
                <div style={{ display: 'flex', gap: 6 }}>
                  {ROLES.map(r => (
                    <button key={r} onClick={() => setRole(r)} style={{ padding: '4px 12px', borderRadius: 4, border: `1px solid ${role === r ? 'var(--pu-400)' : 'var(--border)'}`, background: role === r ? 'var(--pu-400)' : 'transparent', color: role === r ? '#fff' : 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }} title={ROLE_DESC[r]}>{r}</button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{ROLE_DESC[role]}</div>
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={() => createUser.mutate({ email, password: password || undefined, role })} disabled={!email || createUser.isPending}>Create</Button>
                <Button onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>Users</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '35%' }}>Email</th>
                <th style={{ ...th, width: '15%' }}>Role</th>
                <th style={{ ...th, width: '15%' }}>SSO</th>
                <th style={{ ...th, width: '20%' }}>Last login</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {list.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No users yet.</td></tr>
              )}
              {list.data?.map(u => (
                <tr key={u.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{u.email}</td>
                  <td style={td}>
                    <select value={u.role} onChange={e => updateRole.mutate({ id: u.id, role: e.target.value as Role })}
                      style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={td}>{u.ssoProvider ? <Badge tone="green">{u.ssoProvider}</Badge> : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>local</span>}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)' }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}</td>
                  <td style={td}><Button size="sm" variant="danger" onClick={() => deleteUser.mutate({ id: u.id })} disabled={deleteUser.isPending}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card style={{ marginTop: 8 }}>
          <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
            {ROLES.map(r => (
              <div key={r} style={{ display: 'flex', gap: 8 }}>
                <Badge tone={roleTone(r)}>{r}</Badge>
                <span>{ROLE_DESC[r]}</span>
              </div>
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
