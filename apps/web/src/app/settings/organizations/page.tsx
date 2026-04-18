'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card } from '~/components/ui'
import { trpc } from '~/lib/trpc'

export default function OrganizationsPage() {
  const { data: orgs, isLoading, refetch } = trpc.organizations.list.useQuery()
  const createMutation = trpc.organizations.create.useMutation({ onSuccess: () => refetch() })
  const archiveMutation = trpc.organizations.archive.useMutation({ onSuccess: () => refetch() })

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState('')

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    createMutation.mutate(
      { name, slug },
      {
        onSuccess: () => { setName(''); setSlug(''); setShowForm(false) },
        onError: (err) => setError(err.message),
      },
    )
  }

  return (
    <>
      <Topbar
        title="Organizations"
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ Add organization'}
          </Button>
        }
      />
      <PageContent>
        <PageHeader
          title="Organizations"
          desc="Client companies or project groups under this tenant."
        />

        {showForm && (
          <Card>
            <form onSubmit={handleCreate} style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                New organization
              </div>
              {error && (
                <div style={{ fontSize: 11, color: 'var(--red)' }}>{error}</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                <input
                  type="text"
                  placeholder="slug (a-z0-9-)"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  pattern="^[a-z0-9-]+"
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
                <Button type="submit" variant="primary" size="sm" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {isLoading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
            Loading…
          </div>
        )}

        {!isLoading && (!orgs || orgs.length === 0) && (
          <Card>
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              No organizations yet. Click "+ Add organization" to create one.
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {(orgs ?? []).map((org) => (
            <Card key={org.id}>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <Link
                    href={`/settings/organizations/${org.id}`}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--blue)', textDecoration: 'none' }}
                  >
                    {org.name}
                  </Link>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    <code style={{ fontFamily: 'var(--font-mono)' }}>{org.slug}</code>
                    {' · '}
                    {org.createdAt
                      ? new Date(org.createdAt).toLocaleDateString()
                      : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Link
                    href={`/settings/organizations/${org.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      borderRadius: 4,
                      fontSize: 11,
                      textDecoration: 'none',
                    }}
                  >
                    Edit
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Archive "${org.name}"?`)) archiveMutation.mutate({ id: org.id })
                    }}
                  >
                    Archive
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </PageContent>
    </>
  )
}
