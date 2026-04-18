'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, DataTable, ProgressBar, td, th } from '~/components/ui'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { trpc } from '~/lib/trpc'

const INPUT_STYLE = {
  width: '100%',
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: '6px 8px',
  boxSizing: 'border-box' as const,
}

function AddCertModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [domain, setDomain] = useState('')
  const [cert, setCert] = useState('')
  const [key, setKey] = useState('')
  const [err, setErr] = useState('')
  const upload = trpc.certificates.upload.useMutation({
    onSuccess: () => { onSaved(); onClose() },
    onError: (e) => setErr(e.message),
  })

  function submit() {
    setErr('')
    if (!domain.trim() || !cert.trim() || !key.trim()) { setErr('All fields are required.'); return }
    upload.mutate({ domain: domain.trim(), cert: cert.trim(), key: key.trim() })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, width: 480, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Add custom certificate</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text2)' }}>Domain</label>
          <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" style={{ ...INPUT_STYLE, fontFamily: 'var(--font-sans)', fontSize: 12 }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text2)' }}>Certificate (PEM)</label>
          <textarea value={cert} onChange={e => setCert(e.target.value)} rows={5} placeholder="-----BEGIN CERTIFICATE-----" style={{ ...INPUT_STYLE, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text2)' }}>Private key (PEM)</label>
          <textarea value={key} onChange={e => setKey(e.target.value)} rows={5} placeholder="-----BEGIN PRIVATE KEY-----" style={{ ...INPUT_STYLE, resize: 'vertical' }} />
        </div>

        {err && <div style={{ fontSize: 11, color: 'var(--red)' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={upload.isPending}>
            {upload.isPending ? 'Saving…' : 'Save certificate'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function CertHealthButton({ domain }: { domain: string }) {
  const check = trpc.observability.getCertHealthScore.useQuery({ domain }, { enabled: false })
  const [open, setOpen] = useState(false)
  function run() { setOpen(true); check.refetch() }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={run} disabled={check.isFetching} style={{ fontSize: 10 }}>
        {check.isFetching ? '…' : 'Health'}
      </Button>
      {open && check.data && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setOpen(false)}>
          <div style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{domain} — cert health</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: check.data.score >= 80 ? 'var(--green)' : check.data.score >= 50 ? 'var(--amber)' : 'var(--red)', marginBottom: 16 }}>{check.data.score}/100</div>
            {check.data.checks.map(c => (
              <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--border)', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{c.name}</div>
                  {!c.passed && c.fix && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{c.fix}</div>}
                </div>
                <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: c.passed ? 'var(--green)' : 'var(--red)' }}>
                  {c.passed ? `+${c.points}` : `0/${c.points}`}
                </div>
              </div>
            ))}
            <Button style={{ marginTop: 16, width: '100%' }} onClick={() => setOpen(false)}>Close</Button>
          </div>
        </div>
      )}
    </>
  )
}

export default function CertificatesPage() {
  const list = trpc.certificates.list.useQuery(undefined, { refetchInterval: 10_000 })
  const firstDomain = list.data?.[0]?.domain ?? 'main'
  const rateLimit = trpc.certificates.getRateLimitStatus.useQuery({ domain: firstDomain }, { refetchInterval: 60_000 })
  const [caOpen, setCaOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const internalCA = trpc.certificates.getInternalCA.useQuery(undefined, { enabled: caOpen, refetchOnMount: true })

  const now = Date.now()
  const total = list.data?.length ?? 0
  const active = list.data?.filter((c) => c.status === 'active').length ?? 0
  const expiring = list.data?.filter((c) => c.expiresAt && daysUntil(c.expiresAt) < 30 && daysUntil(c.expiresAt) > 0).length ?? 0
  const critical = list.data?.filter((c) => c.expiresAt && daysUntil(c.expiresAt) < 7 && daysUntil(c.expiresAt) > 0).length ?? 0

  function daysUntil(d: Date) { return (new Date(d).getTime() - now) / 86_400_000 }

  const rlData = rateLimit.data
  const rateLimitBanner = rlData?.atLimit ? (
    <div style={{ background: 'rgba(226,75,74,0.12)', borderBottom: '1px solid rgba(226,75,74,0.3)', padding: '8px 20px', fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>✗</span>
      <span>Let&apos;s Encrypt rate limit reached. You cannot issue more certificates this week.</span>
    </div>
  ) : rlData?.nearLimit ? (
    <div style={{ background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(245,158,11,0.3)', padding: '8px 20px', fontSize: 12, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>⚠</span>
      <span>Let&apos;s Encrypt rate limit: {rlData.used}/50 this week. Consider using ZeroSSL for new certificates.</span>
    </div>
  ) : null

  return (
    <>
      {addOpen && <AddCertModal onClose={() => setAddOpen(false)} onSaved={() => list.refetch()} />}
      <Topbar
        title="Certificates"
        banner={rateLimitBanner}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href="/certificates/ct" style={{ fontSize: 11, color: 'var(--pu-400)' }}>CT monitor</Link>
            <Link href="/certificates/multi" style={{ fontSize: 11, color: 'var(--pu-400)' }}>Multi-domain</Link>
            <Link href="/certificates/acme" style={{ fontSize: 11, color: 'var(--pu-400)' }}>ACME accounts</Link>
            <Button variant="primary" onClick={() => setAddOpen(true)}>+ Add custom cert</Button>
          </div>
        }
      />
      <PageContent>
        <PageHeader title="Certificates" desc="TLS certificates managed by this ProxyOS instance." />
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
                <th style={th}></th>
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
                  <tr key={c.id} style={tone === 'red' ? { background: 'var(--red-dim)' } : tone === 'amber' ? { background: 'var(--amber-dim)' } : undefined}>
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
                    <td style={td}><CertHealthButton domain={c.domain} /></td>
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
              {internalCA.isLoading && (
                <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Loading…</span>
              )}
              {!internalCA.isLoading && !internalCA.data && (
                <span style={{ color: 'var(--text3)' }}>CA not reachable — ensure Caddy admin API is running.</span>
              )}
              {internalCA.data && (
                <>
                  <Row k="Subject" v={<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{internalCA.data.subject}</span>} />
                  <Row k="Root fingerprint" v={
                    internalCA.data.fingerprint
                      ? <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)' }}>sha256:{internalCA.data.fingerprint}</code>
                      : <span style={{ color: 'var(--text3)' }}>—</span>
                  } />
                  <Row k="Expires" v={
                    internalCA.data.notAfter
                      ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(internalCA.data.notAfter).toLocaleDateString()}</span>
                      : <span style={{ color: 'var(--text3)' }}>—</span>
                  } />
                </>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <DownloadRootCertButton />
                <Button size="sm" variant="danger" disabled>Regenerate CA</Button>
              </div>
            </div>
          )}
        </Card>
      </PageContent>
    </>
  )
}

function DownloadRootCertButton() {
  const cert = trpc.certificates.downloadRootCert.useQuery(undefined, { enabled: false })
  function download() {
    cert.refetch().then(({ data }) => {
      if (!data) return
      const blob = new Blob([data], { type: 'application/x-pem-file' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'proxyos-ca.pem'
      a.click()
      URL.revokeObjectURL(url)
    })
  }
  return (
    <Button size="sm" onClick={download} disabled={cert.isFetching}>
      {cert.isFetching ? 'Fetching…' : 'Download root cert'}
    </Button>
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
