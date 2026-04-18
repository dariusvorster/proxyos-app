'use client'

import { use, useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card } from '~/components/ui'
import { trpc } from '~/lib/trpc'

export default function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: org, refetch: refetchOrg } = trpc.organizations.get.useQuery({ id })
  const { data: orgSites, refetch: refetchSites } = trpc.organizations.listSites.useQuery({ organizationId: id })
  const { data: members, refetch: refetchMembers } = trpc.organizations.listMembers.useQuery({ organizationId: id })

  const updateMutation = trpc.organizations.update.useMutation({ onSuccess: () => refetchOrg() })
  const createSiteMutation = trpc.sites.create.useMutation({ onSuccess: () => refetchSites() })
  const archiveSiteMutation = trpc.sites.archive.useMutation({ onSuccess: () => refetchSites() })
  const addMemberMutation = trpc.organizations.addMember.useMutation({ onSuccess: () => refetchMembers() })
  const removeMemberMutation = trpc.organizations.removeMember.useMutation({ onSuccess: () => refetchMembers() })

  const [editName, setEditName] = useState('')
  const [showNameEdit, setShowNameEdit] = useState(false)

  const [showSiteForm, setShowSiteForm] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [siteSlug, setSiteSlug] = useState('')
  const [siteDesc, setSiteDesc] = useState('')
  const [siteError, setSiteError] = useState('')

  const [showMemberForm, setShowMemberForm] = useState(false)
  const [memberUserId, setMemberUserId] = useState('')
  const [memberRole, setMemberRole] = useState<'org_admin' | 'org_operator' | 'org_viewer'>('org_viewer')
  const [memberError, setMemberError] = useState('')

  function handleNameSave(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate({ id, name: editName }, {
      onSuccess: () => setShowNameEdit(false),
    })
  }

  function handleSiteCreate(e: React.FormEvent) {
    e.preventDefault()
    setSiteError('')
    createSiteMutation.mutate(
      { organizationId: id, name: siteName, slug: siteSlug, description: siteDesc || undefined },
      {
        onSuccess: () => { setSiteName(''); setSiteSlug(''); setSiteDesc(''); setShowSiteForm(false) },
        onError: (err) => setSiteError(err.message),
      },
    )
  }

  function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    setMemberError('')
    addMemberMutation.mutate(
      { organizationId: id, userId: memberUserId, role: memberRole },
      {
        onSuccess: () => { setMemberUserId(''); setShowMemberForm(false) },
        onError: (err) => setMemberError(err.message),
      },
    )
  }

  return (
    <>
      <Topbar title={org?.name ?? 'Organization'} />
      <PageContent>
        <PageHeader
          title={org?.name ?? '…'}
          desc={org ? `Slug: ${org.slug}` : ''}
        />

        {/* Rename */}
        <Card>
          <div style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showNameEdit ? 8 : 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Organization name</span>
              <Button variant="ghost" size="sm" onClick={() => { setEditName(org?.name ?? ''); setShowNameEdit((v) => !v) }}>
                {showNameEdit ? 'Cancel' : 'Rename'}
              </Button>
            </div>
            {showNameEdit && (
              <form onSubmit={handleNameSave} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text)',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <Button type="submit" variant="primary" size="sm" disabled={updateMutation.isPending}>
                  Save
                </Button>
              </form>
            )}
          </div>
        </Card>

        {/* Sites */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Sites</span>
            <Button variant="ghost" size="sm" onClick={() => setShowSiteForm((v) => !v)}>
              {showSiteForm ? 'Cancel' : '+ Add site'}
            </Button>
          </div>

          {showSiteForm && (
            <Card>
              <form onSubmit={handleSiteCreate} style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {siteError && <div style={{ fontSize: 11, color: 'var(--red)' }}>{siteError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Name"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    required
                    style={{ flex: 1, padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  />
                  <input
                    type="text"
                    placeholder="slug (a-z0-9-)"
                    value={siteSlug}
                    onChange={(e) => setSiteSlug(e.target.value)}
                    required
                    pattern="^[a-z0-9-]+"
                    style={{ flex: 1, padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={siteDesc}
                    onChange={(e) => setSiteDesc(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={createSiteMutation.isPending}>
                    {createSiteMutation.isPending ? 'Creating…' : 'Create'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {(!orgSites || orgSites.length === 0) ? (
            <Card>
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                No sites yet.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {orgSites.map((site) => (
                <Card key={site.id}>
                  <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{site.name}</span>
                      {site.description && (
                        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>{site.description}</span>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        <code style={{ fontFamily: 'var(--font-mono)' }}>{site.slug}</code>
                        {' · '}
                        {site.createdAt ? new Date(site.createdAt).toLocaleDateString() : ''}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Archive "${site.name}"?`)) archiveSiteMutation.mutate({ id: site.id })
                      }}
                    >
                      Archive
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Members */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Members</span>
            <Button variant="ghost" size="sm" onClick={() => setShowMemberForm((v) => !v)}>
              {showMemberForm ? 'Cancel' : '+ Add member'}
            </Button>
          </div>

          {showMemberForm && (
            <Card>
              <form onSubmit={handleAddMember} style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {memberError && <div style={{ fontSize: 11, color: 'var(--red)' }}>{memberError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="User ID"
                    value={memberUserId}
                    onChange={(e) => setMemberUserId(e.target.value)}
                    required
                    style={{ flex: 1, padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  />
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as typeof memberRole)}
                    style={{ padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
                  >
                    <option value="org_admin">org_admin</option>
                    <option value="org_operator">org_operator</option>
                    <option value="org_viewer">org_viewer</option>
                  </select>
                  <Button type="submit" variant="primary" size="sm" disabled={addMemberMutation.isPending}>
                    Add
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {(!members || members.length === 0) ? (
            <Card>
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                No members assigned.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.map((m) => (
                <Card key={m.id}>
                  <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{m.userId}</code>
                      <span style={{ marginLeft: 8 }}><Badge tone="neutral">{m.role}</Badge></span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMemberMutation.mutate({ organizationId: id, userId: m.userId })}
                    >
                      Remove
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </PageContent>
    </>
  )
}
