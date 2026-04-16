'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, DataTable, Input, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function MultiDomainCertsPage() {
  const utils = trpc.useUtils()
  const list = trpc.observability.listMultiDomainCerts.useQuery()
  const create = trpc.observability.createMultiDomainCert.useMutation({
    onSuccess: () => { utils.observability.listMultiDomainCerts.invalidate(); setShowForm(false); setDomains(''); setRoutes('') },
  })
  const del = trpc.observability.deleteMultiDomainCert.useMutation({
    onSuccess: () => utils.observability.listMultiDomainCerts.invalidate(),
  })

  const [showForm, setShowForm] = useState(false)
  const [domains, setDomains] = useState('')
  const [routes, setRoutes] = useState('')
  const [mode, setMode] = useState<'auto' | 'dns'>('auto')
  const [issuer, setIssuer] = useState('')

  function submit() {
    const domainList = domains.split(',').map(d => d.trim()).filter(Boolean)
    const routeList = routes.split(',').map(r => r.trim()).filter(Boolean)
    create.mutate({ domains: domainList, mode, routes: routeList, issuer: issuer || undefined })
  }

  return (
    <>
      <Topbar
        title="Multi-domain certs"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href="/certificates" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Certificates</Link>
            <Button variant="primary" onClick={() => setShowForm(v => !v)}>+ New</Button>
          </div>
        }
      />
      <PageContent>
        {showForm && (
          <Card header={<span>New multi-domain cert</span>} style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="Domains (comma-separated)">
                <Input value={domains} onChange={e => setDomains(e.target.value)} placeholder="app.example.com, api.example.com" />
              </Field>
              <Field label="Mode">
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['auto', 'dns'] as const).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      style={{ padding: '4px 12px', borderRadius: 4, border: `1px solid ${mode === m ? 'var(--pu-400)' : 'var(--border)'}`, background: mode === m ? 'var(--pu-400)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Route IDs (comma-separated, optional)">
                <Input value={routes} onChange={e => setRoutes(e.target.value)} placeholder="route-id-1, route-id-2" />
              </Field>
              <Field label="Issuer (optional)">
                <Input value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="Let's Encrypt" />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={submit} disabled={!domains || create.isPending}>Create</Button>
                <Button onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        <Card header={<span>Multi-domain certificates</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '40%' }}>Domains</th>
                <th style={{ ...th, width: '10%' }}>Mode</th>
                <th style={{ ...th, width: '20%' }}>Issuer</th>
                <th style={{ ...th, width: '20%' }}>Created</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {list.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No multi-domain certs — create one to share a cert across multiple routes.</td></tr>
              )}
              {list.data?.map(c => (
                <tr key={c.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {c.domains.map((d, i) => <span key={i} style={{ display: 'block' }}>{d}</span>)}
                  </td>
                  <td style={td}><Badge tone={c.mode === 'dns' ? 'amber' : 'green'}>{c.mode}</Badge></td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{c.issuer ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 11 }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td style={td}>
                    <Button size="sm" variant="danger" onClick={() => del.mutate({ id: c.id })} disabled={del.isPending}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Multi-domain certs (SAN certificates) let you share one certificate across multiple subdomains, reducing Let&apos;s Encrypt rate limit consumption. DNS-01 challenge is required for wildcard domains.
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
