'use client'

import { useState, type FormEvent } from 'react'
import { Badge, Button, Card, Input, Select } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type ProviderType = 'authentik' | 'authelia' | 'keycloak' | 'zitadel'

export default function SSOPage() {
  const utils = trpc.useUtils()
  const list = trpc.sso.list.useQuery()
  const create = trpc.sso.create.useMutation({
    onSuccess: () => { utils.sso.list.invalidate(); setName(''); setBaseUrl(''); setError(null) },
    onError: (e) => setError(e.message),
  })
  const del = trpc.sso.delete.useMutation({ onSuccess: () => utils.sso.list.invalidate() })
  const test = trpc.sso.test.useMutation({ onSuccess: () => utils.sso.list.invalidate() })

  const [name, setName] = useState('')
  const [type, setType] = useState<ProviderType>('authentik')
  const [baseUrl, setBaseUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    create.mutate({ name, type, baseUrl, trustedIPs: [] })
  }

  return (
    <>
      <Topbar title="SSO Providers" />
      <PageContent>
        <Card header={<span>Add provider</span>}>
          <form onSubmit={onSubmit} style={{ padding: '12px 13px', display: 'grid', gap: 8, gridTemplateColumns: '1fr auto 2fr auto' }}>
            <Input placeholder="name (authentik-main)" value={name} onChange={(e) => setName(e.target.value)} required />
            <Select value={type} onChange={(e) => setType(e.target.value as ProviderType)}>
              <option value="authentik">Authentik</option>
              <option value="authelia">Authelia</option>
              <option value="keycloak">Keycloak</option>
              <option value="zitadel">Zitadel</option>
            </Select>
            <Input placeholder="base URL (https://auth.example.com)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
            <Button type="submit" variant="primary" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add'}</Button>
          </form>
          {error && <div style={{ padding: '0 13px 12px', color: 'var(--red)', fontSize: 11 }}>{error}</div>}
        </Card>

        <Card header={<span>Providers</span>}>
          {list.data?.length === 0 && <div style={{ padding: '16px 13px', color: 'var(--text-dim)', fontSize: 11 }}>None yet.</div>}
          {list.data?.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderTop: '0.5px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{p.name} <Badge tone="purple">{p.type}</Badge></div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{p.forwardAuthUrl}</div>
                <div style={{ fontSize: 10, color: p.testStatus === 'ok' ? 'var(--green)' : p.testStatus === 'error' ? 'var(--red)' : 'var(--text-dim)', marginTop: 2 }}>
                  last test · {p.testStatus}{p.lastTestedAt ? ` · ${new Date(p.lastTestedAt).toLocaleString()}` : ''}
                </div>
              </div>
              <Button size="sm" onClick={() => test.mutate({ id: p.id })} disabled={test.isPending}>Test</Button>
              <Button size="sm" variant="danger" onClick={() => del.mutate({ id: p.id })}>Remove</Button>
            </div>
          ))}
        </Card>
      </PageContent>
    </>
  )
}
