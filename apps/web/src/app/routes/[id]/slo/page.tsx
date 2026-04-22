'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { AlertBanner, Badge, Button, Card, Input, Toggle } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

export default function RouteSLOPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [handleError] = useErrorHandler()
  const utils = trpc.useUtils()

  const slo = trpc.intelligence.getSLO.useQuery({ routeId: id })
  const status = trpc.intelligence.getSLOStatus.useQuery({ routeId: id })
  const trend = trpc.intelligence.getLatencyTrend.useQuery({ routeId: id })
  const history = trpc.intelligence.getSLOHistory.useQuery({ routeId: id, limit: 30 })

  const setSLO = trpc.intelligence.setSLO.useMutation({
    onSuccess: () => { utils.intelligence.getSLO.invalidate(); utils.intelligence.getSLOStatus.invalidate() },
    onError: handleError,
  })
  const deleteSLO = trpc.intelligence.deleteSLO.useMutation({
    onSuccess: () => { utils.intelligence.getSLO.invalidate(); utils.intelligence.getSLOStatus.invalidate() },
    onError: handleError,
  })

  const [p95, setP95] = useState(slo.data?.p95TargetMs?.toString() ?? '200')
  const [p99, setP99] = useState(slo.data?.p99TargetMs?.toString() ?? '')
  const [window, setWindow] = useState(slo.data?.windowDays?.toString() ?? '30')
  const [alert, setAlert] = useState(slo.data?.alertOnBreach !== 0)

  const trendTone = trend.data?.trend === 'improving' ? 'green' : trend.data?.trend === 'degrading' ? 'red' : 'neutral'
  const complianceTone = (status.data?.p95CompliancePct ?? 100) >= 99 ? 'green' : (status.data?.p95CompliancePct ?? 100) >= 95 ? 'amber' : 'red'

  return (
    <>
      <Topbar
        title="SLO & Trend"
        actions={<Link href={`/routes/${id}`} style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Route</Link>}
      />
      <PageContent>
        {/* Status banner */}
        {status.data && (
          <Card header={<span>SLO compliance</span>} style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <Stat label="p95 compliance" value={<><Badge tone={complianceTone}>{status.data.p95CompliancePct}%</Badge></>} />
              <Stat label="p95 target" value={`${status.data.p95TargetMs}ms`} />
              <Stat label="window" value={`${status.data.windowDays}d`} />
              <Stat label="trend" value={<Badge tone={trendTone}>{status.data.trend}</Badge>} />
            </div>
            {trend.data?.alert && (
              <div style={{ marginTop: 10 }}>
                <AlertBanner tone="amber">7-day avg latency is 1.5× the 30-day average ({trend.data.avg7dayMs}ms vs {trend.data.avg30dayMs}ms) — service may be degrading.</AlertBanner>
              </div>
            )}
          </Card>
        )}

        {/* Trend chart (text) */}
        {trend.data && trend.data.daily.length > 0 && (
          <Card header={<span>Latency trend (30d)</span>} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
              {trend.data.daily.slice(-14).map((d, i) => {
                const maxMs = Math.max(...trend.data.daily.map(x => x.avgMs), 1)
                const h = Math.round((d.avgMs / maxMs) * 56)
                return (
                  <div key={i} title={`${d.date}: ${d.avgMs}ms`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', height: h, background: d.avgMs > (trend.data.avg30dayMs * 1.5) ? 'var(--red)' : 'var(--pu-400)', borderRadius: '2px 2px 0 0', opacity: 0.8 }} />
                    <div style={{ fontSize: 8, color: 'var(--text-ghost)', marginTop: 2, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{d.date.slice(5)}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              <span>7d avg: <strong style={{ color: 'var(--text-primary)' }}>{trend.data.avg7dayMs}ms</strong></span>
              <span>30d avg: <strong style={{ color: 'var(--text-primary)' }}>{trend.data.avg30dayMs}ms</strong></span>
              <Badge tone={trendTone}>{trend.data.trend}</Badge>
            </div>
          </Card>
        )}

        {/* SLO config */}
        <Card header={<span>SLO configuration</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 8, marginBottom: 12 }}>
            <Field label="p95 target (ms)"><Input type="number" value={p95} onChange={e => setP95(e.target.value)} /></Field>
            <Field label="p99 target (ms, optional)"><Input type="number" value={p99} onChange={e => setP99(e.target.value)} placeholder="—" /></Field>
            <Field label="Window (days)"><Input type="number" value={window} onChange={e => setWindow(e.target.value)} /></Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12 }}>Alert on breach</span>
            <Toggle checked={alert} onChange={setAlert} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={() => setSLO.mutate({ routeId: id, p95TargetMs: Number(p95), p99TargetMs: p99 ? Number(p99) : undefined, windowDays: Number(window), alertOnBreach: alert })} disabled={setSLO.isPending}>
              {slo.data ? 'Update SLO' : 'Set SLO'}
            </Button>
            {slo.data && (
              <Button onClick={() => deleteSLO.mutate({ routeId: id })} disabled={deleteSLO.isPending}>Remove SLO</Button>
            )}
          </div>
        </Card>

        {/* History */}
        {history.data && history.data.length > 0 && (
          <Card header={<span>Compliance history</span>} style={{ marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  {['Date', 'p95 actual', 'Compliant', 'Samples'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.data.map(r => (
                  <tr key={r.date} style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.date}</td>
                    <td style={{ padding: '5px 8px' }}>{r.p95ActualMs ? `${r.p95ActualMs}ms` : '—'}</td>
                    <td style={{ padding: '5px 8px' }}>
                      {r.p95Compliant === 1 ? <Badge tone="green">✓</Badge> : r.p95Compliant === 0 ? <Badge tone="red">✗</Badge> : <Badge tone="neutral">—</Badge>}
                    </td>
                    <td style={{ padding: '5px 8px', color: 'var(--text-dim)' }}>{r.sampleCount ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  )
}
