'use client'

import { use, useState } from 'react'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

type SiteRole = 'site_operator' | 'site_viewer'

const ROLE_TONE: Record<string, 'blue' | 'neutral'> = {
  site_operator: 'blue',
  site_viewer: 'neutral',
}

export default function SiteMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = use(params)
  const [handleError] = useErrorHandler()

  const { data: members, refetch } = trpc.sites.listMembers.useQuery({ siteId })
  const { data: users } = trpc.users.list.useQuery()
  const addMutation = trpc.sites.addMember.useMutation({ onSuccess: () => { void refetch(); setShowForm(false) }, onError: handleError })
  const removeMutation = trpc.sites.removeMember.useMutation({ onSuccess: () => refetch(), onError: handleError })

  const [showForm, setShowForm] = useState(false)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<SiteRole>('site_viewer')

  const memberUserIds = new Set(members?.map((m) => m.userId) ?? [])
  const eligibleUsers = users?.filter((u) => !memberUserIds.has(u.id)) ?? []

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    addMutation.mutate({ siteId, userId, role })
  }

  return (
    <>
      <Topbar title="Site Members" />
      <PageContent>
        <PageHeader
          title="Site Members"
          desc="Users with direct access to this site."
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : '+ Add member'}
          </Button>
        </div>

        {showForm && (
          <Card>
            <form onSubmit={handleAdd} style={{ padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                style={{
                  padding: '4px 8px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text)',
                  fontSize: 12,
                  minWidth: 180,
                }}
              >
                <option value="">Select user…</option>
                {eligibleUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as SiteRole)}
                style={{
                  padding: '4px 8px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              >
                <option value="site_viewer">site_viewer</option>
                <option value="site_operator">site_operator</option>
              </select>
              <Button type="submit" variant="primary" size="sm" disabled={addMutation.isPending || !userId}>
                {addMutation.isPending ? 'Adding…' : 'Add'}
              </Button>
            </form>
          </Card>
        )}

        {(!members || members.length === 0) ? (
          <Card>
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              No site-level members. Users inherit access from their org role.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {members.map((member) => {
              const user = users?.find((u) => u.id === member.userId)
              return (
                <Card key={member.id}>
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {user?.email ?? member.userId}
                      </span>
                      <span style={{ marginLeft: 8 }}>
                        <Badge tone={ROLE_TONE[member.role] ?? 'neutral'}>{member.role}</Badge>
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removeMutation.isPending}
                      onClick={() => {
                        if (confirm(`Remove ${user?.email ?? member.userId} from this site?`)) {
                          removeMutation.mutate({ siteId, userId: member.userId })
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </PageContent>
    </>
  )
}
