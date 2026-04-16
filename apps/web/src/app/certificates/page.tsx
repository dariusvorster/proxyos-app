'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, DataTable, ProgressBar, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function CertificatesPage() {
  const list = trpc.certificates.list.useQuery(undefined, { refetchInterval: 10_000 })
  const [caOpen, setCaOpen] = useState(false)

  const now = Date.now()
  const total = list.data?.length ?? 0
  const active = list.data?.filter((c) => c.status === 'active').length ?? 0
  const expiring = list.data?.filter((c) => c.expiresAt && daysUntil(c.expiresAt) < 30 && daysUntil(c.expiresAt) > 0).length ?? 0
  const critical = list.data?.filter((c) => c.expiresAt && daysUntil(c.expiresAt) < 7 && daysUntil(c.expiresAt) > 0).length ?? 0

  function daysUntil(d: Date) { return (new Date(d).getTime() - now) / 86_400_000 }

  return (
    <>
      <Topbar
        title="Certificates"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href="/certificates/ct" style={{ fontSize: 11, color: 'var(--pu-400)' }}>CT monitor</Link>
            <Link href="/certificates/multi" style={{ fontSize: 11, color: 'var(--pu-400)' }}>Multi-domain</Link>
            <Link href="/certificates/acme" style={{ fontSize: 11, color: 'var(--pu-400)' }}>ACME accounts</Link>
            <Button variant="primary" disabled title="Custom certs not wired in V1">+ Add custom cert</Button>
          </div>
        }
      />
      <PageContent>
        <Card>
          <div style={{ display: 'flex', gap: 28, fontSize: 12 }}>
            <Stat label="Active" count={active} tone="green" />
            <Stat label="Expiring <30d" count={expiring} tone="amber" />
            <Stat label="Critical <7d" count={critical} tone="red" />
            <Stat label="Total" count={total} tone="muted" />
          </div>
        </Card>

        <Card header={<span>All certificates</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '26%' }}>Domain</th>
                <th style={{ ...th, width: '12%' }}>Issuer</th>
                <th style={{ ...th, width: '10%' }}>Mode</th>
                <th style={{ ...th, width: '14%' }}>Issued</th>
                <th style={{ ...th, width: '14%' }}>Expires</th>
                <th style={{ ...th, width: '16%' }}>Validity</th>
                <th style={{ ...th, width: '8%' }}>Renew</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No certificates yet — create a route first.</td></tr>
              )}
              {list.data?.map((c) => {
                const days = c.expiresAt ? Math.round(daysUntil(c.expiresAt)) : null
                const tone = days == null ? 'amber' : days < 8 ? 'red' : days < 30 ? 'amber' : 'green'
                const pct = days == null ? 100 : Math.max(0, Math.min(100, (days / 90) * 100))
                return (
                  <tr key={c.id} style={tone === 'red' ? { background: 'rgba(226,75,74,0.04)' } : undefined}>
                    <td style={{ ...td, fontWeight: 500 }}>{c.domain}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{issuerLabel(c.source)}</td>
                    <td style={td}><Badge tone={c.source === 'internal' ? 'amber' : c.source === 'custom' ? 'neutral' : 'green'}>{c.source}</Badge></td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{c.issuedAt ? new Date(c.issuedAt).toLocaleDateString() : '—'}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ProgressBar value={pct} tone={tone as 'green' | 'amber' | 'red'} width={72} />
                        <span style={{ fontSize: 11, color: `var(--${tone})` }}>{days != null ? `${days}d` : c.status}</span>
                      </div>
                    </td>
                    <td style={td}>{c.autoRenew ? <Badge tone="green">ON</Badge> : <Badge tone="neutral">OFF</Badge>}</td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        </Card>

        <Card>
          <button
            onClick={() => setCaOpen((v) => !v)}
            style={{ width: '100%', background: 'none', border: 0, color: 'var(--text-primary)', fontSize: 12, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: 0 }}
          >
            <span>Internal CA</span>
            <span style={{ color: 'var(--text-dim)' }}>{caOpen ? '▾' : '▸'}</span>
          </button>
          {caOpen && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: 11 }}>
              <Row k="Root fingerprint" v={<code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>sha256:— (generated by Caddy on first use)</code>} />
              <Row k="Expires" v={<span style={{ color: 'var(--text-secondary)' }}>—</span>} />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button size="sm" disabled>Download root cert</Button>
                <Button size="sm" variant="danger" disabled>Regenerate CA</Button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                Internal CA details are exposed via Caddy&apos;s /pki/ca/local endpoint. Not yet fetched in V1 UI.
              </div>
            </div>
          )}
        </Card>
      </PageContent>
    </>
  )
}

function issuerLabel(source: string): string {
  switch (source) {
    case 'acme_le': return "Let's Encrypt"
    case 'acme_zerossl': return 'ZeroSSL'
    case 'dns01': return 'DNS-01'
    case 'internal': return 'Internal CA'
    case 'custom': return 'Custom'
    default: return source
  }
}

function Stat({ label, count, tone }: { label: string; count: number; tone: 'green' | 'amber' | 'red' | 'muted' }) {
  const color = tone === 'muted' ? 'var(--text-dim)' : `var(--${tone})`
  return (
    <span>
      <strong style={{ color, fontSize: 14 }}>{count}</strong>{' '}
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
    </span>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-dim)' }}>{k}</span>
      <span>{v}</span>
    </div>
  )
}
