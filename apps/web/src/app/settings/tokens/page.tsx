'use client'

import Link from 'next/link'
import { Button, Card, Input } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'

export default function TokensPage() {
  return (
    <>
      <Topbar title="API Tokens" actions={<Link href="/settings" style={{ fontSize: 11, color: 'var(--accent)' }}>← Settings</Link>} />
      <PageContent>
        <Card header={<span>Personal access tokens</span>}>
          <div style={{ padding: '2px 0', fontSize: 11, color: 'var(--text-dim)' }}>
            Tokens allow API access to ProxyOS without dashboard auth. Each token is scoped and revocable.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Input placeholder="Token name" disabled />
            <Button variant="primary" disabled>Generate</Button>
          </div>
          <div style={{ marginTop: 16, color: 'var(--text-ghost)', fontSize: 10 }}>Token management not yet wired in V1.</div>
        </Card>
      </PageContent>
    </>
  )
}
