'use client'

import Link from 'next/link'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Card } from '~/components/ui'
import { trpc } from '~/lib/trpc'

export default function SitesPage() {
  const { data: sites, isLoading } = trpc.sites.listAll.useQuery()

  return (
    <>
      <Topbar title="Sites" />
      <PageContent>
        <PageHeader
          title="All sites"
          desc="Flat view of all sites across all organizations. Manage sites through the organization detail page."
        />

        {isLoading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
            Loading…
          </div>
        )}

        {!isLoading && (!sites || sites.length === 0) && (
          <Card>
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
              No sites yet. Create one from an{' '}
              <Link href="/settings/organizations" style={{ color: 'var(--blue)' }}>organization detail page</Link>.
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {(sites ?? []).map((site) => (
            <Card key={site.id}>
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {site.name}
                    </span>
                    {site.description && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>{site.description}</span>
                    )}
                  </div>
                  <Link
                    href={`/settings/organizations/${site.organizationId}`}
                    style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none' }}
                  >
                    View org ↗
                  </Link>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  <code style={{ fontFamily: 'var(--font-mono)' }}>{site.slug}</code>
                  {' · org: '}
                  <code style={{ fontFamily: 'var(--font-mono)' }}>{site.organizationId}</code>
                  {' · '}
                  {site.createdAt ? new Date(site.createdAt).toLocaleDateString() : ''}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {sites && sites.length > 0 && (
          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>
            {sites.length} site{sites.length !== 1 ? 's' : ''} total
          </div>
        )}
      </PageContent>
    </>
  )
}
