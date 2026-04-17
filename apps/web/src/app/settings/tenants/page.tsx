'use client'

import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function TenantsPage() {
  const { data: tenants = [], refetch } = trpc.tenants.list.useQuery()
  const createMut = trpc.tenants.create.useMutation({ onSuccess: () => { refetch(); setShowCreate(false); setForm({ name: '', slug: '' }) } })
  const deleteMut = trpc.tenants.delete.useMutation({ onSuccess: () => refetch() })
  const addMemberMut = trpc.tenants.addMember.useMutation({ onSuccess: () => { refetchMembers(); setNewMemberEmail('') } })
  const removeMemberMut = trpc.tenants.removeMember.useMutation({ onSuccess: () => refetchMembers() })
  const setRoleMut = trpc.tenants.setMemberRole.useMutation({ onSuccess: () => refetchMembers() })
  const { data: allUsers = [] } = trpc.users.list.useQuery()

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '' })
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null)
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [error, setError] = useState('')

  const { data: members = [], refetch: refetchMembers } = trpc.tenants.getMembers.useQuery(
    { tenantId: selectedTenant! },
    { enabled: !!selectedTenant }
  )

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  function handleCreate() {
    setError('')
    createMut.mutate(form, { onError: (e) => setError(e.message) })
  }

  function handleAddMember() {
    if (!selectedTenant) return
    const user = allUsers.find(u => u.email === newMemberEmail)
    if (!user) { setError('No user found with that email'); return }
    setError('')
    addMemberMut.mutate({ tenantId: selectedTenant, userId: user.id }, { onError: (e) => setError(e.message) })
  }

  const selectedTenantData = tenants.find(t => t.id === selectedTenant)

  return (
    <>
      <Topbar title="Tenants" actions={
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}
        >
          New tenant
        </button>
      } />
      <PageContent>
        <PageHeader title="Tenants" desc="Manage organizations and their members for multi-tenant access control." />

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)', fontFamily: 'var(--font-sans)' }}>
            {error}
          </div>
        )}

        {showCreate && (
          <div style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Create tenant</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
                  placeholder="Acme Corp"
                  style={{ width: '100%', padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>Slug</label>
                <input
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  placeholder="acme-corp"
                  style={{ width: '100%', padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreate} disabled={createMut.isPending} style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                {createMut.isPending ? 'Creating…' : 'Create'}
              </button>
              <button onClick={() => setShowCreate(false)} style={{ padding: '7px 16px', background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: selectedTenant ? '300px 1fr' : '1fr', gap: 16 }}>
          {/* Tenant list */}
          <div style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {tenants.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text3)' }}>No tenants yet</div>
            ) : tenants.map(t => (
              <div
                key={t.id}
                onClick={() => setSelectedTenant(t.id)}
                style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedTenant === t.id ? 'var(--accent-dim)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: selectedTenant === t.id ? 'var(--accent-dark)' : 'var(--text)' }}>{t.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{t.slug} · {t.memberCount} member{t.memberCount !== 1 ? 's' : ''}</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteMut.mutate({ id: t.id }) }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '2px 4px', lineHeight: 1 }}
                  title="Delete tenant"
                >×</button>
              </div>
            ))}
          </div>

          {/* Member panel */}
          {selectedTenant && selectedTenantData && (
            <div style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
                {selectedTenantData.name} — Members
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={{ flex: 1, padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}
                />
                <button onClick={handleAddMember} disabled={addMemberMut.isPending} style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                  Add
                </button>
              </div>

              {members.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text3)' }}>No members yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {members.map(m => (
                    <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text)' }}>{m.displayName ?? m.email}</div>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{m.email}</div>
                      </div>
                      <select
                        value={m.role}
                        onChange={e => setRoleMut.mutate({ tenantId: selectedTenant, userId: m.userId, role: e.target.value as 'admin' | 'user' })}
                        style={{ padding: '4px 8px', background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => removeMemberMut.mutate({ tenantId: selectedTenant, userId: m.userId })}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: '2px 4px', lineHeight: 1 }}
                        title="Remove"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </PageContent>
    </>
  )
}
