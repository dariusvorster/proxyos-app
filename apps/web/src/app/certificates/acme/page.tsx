'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, DataTable, Input, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

const ACME_URLS: Record<string, string> = {
  letsencrypt: 'https://acme-v02.api.letsencrypt.org/directory',
  zerossl: 'https://acme.zerossl.com/v2/DV90',
  custom: '',
}

const RATE_LIMIT: Record<string, number> = {
  letsencrypt: 50,
  zerossl: 100,
  custom: 999,
}

export default function AcmeAccountsPage() {
  const [handleError] = useErrorHandler()
  const utils = trpc.useUtils()
  const list = trpc.observability.listAcmeAccounts.useQuery()
  const create = trpc.observability.createAcmeAccount.useMutation({
    onSuccess: () => { utils.observability.listAcmeAccounts.invalidate(); setShowForm(false); setEmail(''); setCustomUrl('') },
    onError: handleError,
  })
  const del = trpc.observability.deleteAcmeAccount.useMutation({
    onSuccess: () => utils.observability.listAcmeAccounts.invalidate(),
    onError: handleError,
  })

  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [provider, setProvider] = useState<'letsencrypt' | 'zerossl' | 'custom'>('letsencrypt')
  const [customUrl, setCustomUrl] = useState('')

  function submit() {
    create.mutate({ email, provider, acmeUrl: provider === 'custom' ? customUrl : ACME_URLS[provider] })
  }

  return (
    <>
      <Topbar
        title="ACME accounts"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href="/certificates" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Certificates</Link>
            <Button variant="primary" onClick={() => setShowForm(v => !v)}>+ Add account</Button>
          </div>
        }
      />
      <PageContent>
        {showForm && (
          <Card header={<span>New ACME account</span>} style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="Email">
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </Field>
              <Field label="Provider">
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['letsencrypt', 'zerossl', 'custom'] as const).map(p => (
                    <button key={p} onClick={() => setProvider(p)}
                      style={{ padding: '4px 12px', borderRadius: 4, border: `1px solid ${provider === p ? 'var(--pu-400)' : 'var(--border)'}`, background: provider === p ? 'var(--pu-400)' : 'transparent', color: provider === p ? '#fff' : 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
                      {p === 'letsencrypt' ? "Let's Encrypt" : p === 'zerossl' ? 'ZeroSSL' : 'Custom'}
                    </button>
                  ))}
                </div>
              </Field>
              {provider === 'custom' && (
                <Field label="ACME directory URL">
                  <Input value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://acme.example.com/directory" />
                </Field>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                URL: <code style={{ fontFamily: 'var(--font-mono)' }}>{provider === 'custom' ? customUrl || '—' : ACME_URLS[provider]}</code>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={submit} disabled={!email || (provider === 'custom' && !customUrl) || create.isPending}>Add</Button>
                <Button onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>ACME accounts</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '30%' }}>Email</th>
                <th style={{ ...th, width: '15%' }}>Provider</th>
                <th style={{ ...th, width: '35%' }}>ACME URL</th>
                <th style={{ ...th, width: '12%' }}>Rate limit</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {list.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No ACME accounts — Caddy uses its built-in account. Add accounts to distribute certs across rate limit buckets.</td></tr>
              )}
              {list.data?.map(a => {
                const limit = RATE_LIMIT[a.provider] ?? 50
                const pct = Math.round((a.rateLimitUsed / limit) * 100)
                const tone = pct > 80 ? 'red' : pct > 50 ? 'amber' : 'green'
                return (
                  <tr key={a.id}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{a.email}</td>
                    <td style={td}><Badge tone="neutral">{a.provider}</Badge></td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.acmeUrl}</td>
                    <td style={td}>
                      <Badge tone={tone}>{a.rateLimitUsed}/{limit}</Badge>
                    </td>
                    <td style={td}>
                      <Button size="sm" variant="danger" onClick={() => del.mutate({ id: a.id })} disabled={del.isPending}>Remove</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        </Card>

        <Card style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            ProxyOS can distribute certificate provisioning across multiple ACME accounts to avoid Let&apos;s Encrypt rate limits (50 certs/domain/week). Add a second account to double your capacity.
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
