'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertBanner, Badge, Button, Card, DataTable, Input, Toggle, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

export default function CTMonitorPage() {
  const [handleError] = useErrorHandler()
  const utils = trpc.useUtils()
  const config = trpc.observability.getCTConfig.useQuery()
  const alerts = trpc.observability.listCTAlerts.useQuery({ includeAcknowledged: false })
  const setCfg = trpc.observability.setCTConfig.useMutation({
    onSuccess: () => utils.observability.getCTConfig.invalidate(),
    onError: handleError,
  })
  const ack = trpc.observability.acknowledgeCTAlert.useMutation({
    onSuccess: () => utils.observability.listCTAlerts.invalidate(),
    onError: handleError,
  })
  const check = trpc.observability.runCTCheck.useMutation({
    onSuccess: () => utils.observability.listCTAlerts.invalidate(),
    onError: handleError,
  })

  const [domain, setDomain] = useState('')
  const [alertOnNew, setAlertOnNew] = useState(config.data?.alertOnNewIssuer ?? true)
  const [interval, setInterval] = useState(config.data?.checkIntervalHours?.toString() ?? '6')

  return (
    <>
      <Topbar
        title="CT monitoring"
        actions={<Link href="/certificates" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Certificates</Link>}
      />
      <PageContent>
        {(alerts.data?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 8 }}>
            <AlertBanner tone="red">
              {alerts.data!.length} unacknowledged CT alert{alerts.data!.length !== 1 ? 's' : ''} — certificates issued by unknown CAs detected.
            </AlertBanner>
          </div>
        )}

        {/* Config */}
        <Card header={<span>CT monitor config</span>} style={{ marginBottom: 8 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12 }}>Alert on new issuer</span>
              <Toggle checked={alertOnNew} onChange={v => { setAlertOnNew(v); setCfg.mutate({ checkIntervalHours: Number(interval), alertOnNewIssuer: v, knownIssuers: config.data?.knownIssuers ?? [] }) }} />
            </div>
            <Field label="Check interval (hours)">
              <Input type="number" value={interval} onChange={e => setInterval(e.target.value)}
                onBlur={() => setCfg.mutate({ checkIntervalHours: Number(interval), alertOnNewIssuer: alertOnNew, knownIssuers: config.data?.knownIssuers ?? [] })} />
            </Field>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Known issuers (auto-detected): {(config.data?.knownIssuers ?? []).join(', ') || '—'}
            </div>
          </div>
        </Card>

        {/* Manual check */}
        <Card header={<span>Manual CT check</span>} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="gitbay.homelabza.com" style={{ flex: 1 }} />
            <Button variant="primary" onClick={() => check.mutate({ domain })} disabled={!domain || check.isPending}>
              {check.isPending ? 'Checking…' : 'Check crt.sh'}
            </Button>
          </div>
          {check.data && (
            <div style={{ marginTop: 8, fontSize: 12, color: check.data.newAlerts > 0 ? 'var(--red)' : 'var(--green)' }}>
              {check.data.newAlerts > 0 ? `${check.data.newAlerts} new unknown cert(s) found` : 'No unknown certificates detected'}
            </div>
          )}
        </Card>

        {/* Alerts table */}
        <Card header={<span>CT alerts</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '22%' }}>Domain</th>
                <th style={{ ...th, width: '30%' }}>Issuer</th>
                <th style={{ ...th, width: '20%' }}>Detected</th>
                <th style={{ ...th, width: '18%' }}>Not before</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {alerts.data?.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No CT alerts — all monitored domains show only known issuers.</td></tr>
              )}
              {alerts.data?.map(a => (
                <tr key={a.id} style={{ background: 'rgba(226,75,74,0.04)' }}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{a.domain}</td>
                  <td style={{ ...td, fontSize: 11 }}>{a.issuer}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)' }}>{new Date(a.detectedAt).toLocaleString()}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{a.notBefore?.slice(0, 10) ?? '—'}</td>
                  <td style={td}>
                    <Button size="sm" onClick={() => ack.mutate({ id: a.id })} disabled={ack.isPending}>Acknowledge</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Certificate Transparency monitoring polls <a href="https://crt.sh" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pu-400)' }}>crt.sh</a> for each configured domain. Any certificate issued by an unknown CA triggers an alert — useful for detecting domain compromise or mis-issuance.
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
