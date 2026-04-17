'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Card, StatCard } from '~/components/ui'
import { trpc } from '~/lib/trpc'

interface RpsPoint { ts: number; rps: number; errRate: number; avgMs: number }
interface LiveMetrics {
  ts: number
  totalRequests: number
  rpsTimeline: RpsPoint[]
  topRoutes: Array<{ routeId: string; count: number }>
  topIps: Array<{ ip: string; count: number }>
  statusCounts: { '2xx': number; '3xx': number; '4xx': number; '5xx': number }
}

const BAR_W = 4
const BAR_GAP = 2
const CHART_H = 80
const MAX_BARS = 60

function RpsChart({ timeline }: { timeline: RpsPoint[] }) {
  const points = timeline.slice(-MAX_BARS)
  const maxRps = Math.max(1, ...points.map(p => p.rps))
  const w = MAX_BARS * (BAR_W + BAR_GAP)

  return (
    <svg width={w} height={CHART_H} style={{ display: 'block', width: '100%', height: CHART_H }}>
      {points.map((p, i) => {
        const h = Math.max(2, Math.round((p.rps / maxRps) * (CHART_H - 8)))
        const x = i * (BAR_W + BAR_GAP)
        const y = CHART_H - h
        const color = p.errRate > 0.1 ? 'var(--red)' : p.errRate > 0 ? 'var(--amber)' : 'var(--green)'
        return <rect key={p.ts} x={x} y={y} width={BAR_W} height={h} fill={color} rx={1} />
      })}
    </svg>
  )
}

export default function LiveDashboardPage() {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null)
  const [connected, setConnected] = useState(false)
  const routes = trpc.routes.list.useQuery()
  const routeMap = Object.fromEntries((routes.data ?? []).map(r => [r.id, r.domain]))
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource('/api/live/metrics')
    esRef.current = es
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (e) => {
      try { setMetrics(JSON.parse(e.data as string) as LiveMetrics) } catch { /* ignore */ }
    }
    return () => { es.close(); setConnected(false) }
  }, [])

  const currentRps = metrics?.rpsTimeline.at(-1)?.rps ?? 0
  const totalReqs = metrics?.totalRequests ?? 0
  const errRate = metrics ? (metrics.statusCounts['5xx'] / Math.max(1, totalReqs) * 100).toFixed(1) : '—'
  const avgMs = metrics?.rpsTimeline.length
    ? Math.round(metrics.rpsTimeline.reduce((s, p) => s + p.avgMs, 0) / metrics.rpsTimeline.length)
    : 0

  return (
    <>
      <Topbar
        title="Live"
        actions={
          <span style={{ fontSize: 11, color: connected ? 'var(--green)' : 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--text3)', display: 'inline-block' }} />
            {connected ? 'Live' : 'Connecting…'}
          </span>
        }
      />
      <PageContent>
        <PageHeader title="Live traffic" desc="1-second granularity — last 60 seconds" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <StatCard label="Req / s" value={currentRps} sub="current second" subTone="muted" />
          <StatCard label="Requests / 60s" value={totalReqs} sub="rolling window" subTone="muted" />
          <StatCard label="Avg latency" value={avgMs > 0 ? `${avgMs}ms` : '—'} sub="60s average" subTone="muted" />
          <StatCard label="5xx rate" value={`${errRate}%`} sub="server errors" subTone={Number(errRate) > 1 ? 'red' : 'green'} />
        </div>

        <Card header={<span>Requests / second — last 60s</span>}>
          <div style={{ padding: '12px 13px' }}>
            {metrics ? <RpsChart timeline={metrics.rpsTimeline} /> : (
              <div style={{ height: CHART_H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 11 }}>
                Waiting for data…
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>
              <span style={{ color: 'var(--green)' }}>● OK</span>
              <span style={{ color: 'var(--amber)' }}>● &lt;10% errors</span>
              <span style={{ color: 'var(--red)' }}>● ≥10% errors</span>
            </div>
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Card header={<span>Status codes — 60s</span>}>
            <div style={{ padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(['2xx', '3xx', '4xx', '5xx'] as const).map(code => {
                const count = metrics?.statusCounts[code] ?? 0
                const total = totalReqs
                const pct = total > 0 ? (count / total * 100).toFixed(0) : 0
                const color = code === '5xx' ? 'var(--red)' : code === '4xx' ? 'var(--amber)' : 'var(--green)'
                return (
                  <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 28, fontSize: 11, color }}>{code}</span>
                    <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 2, height: 6 }}>
                      <div style={{ width: `${pct}%`, height: 6, background: color, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text2)', width: 60, textAlign: 'right' }}>{count} ({pct}%)</span>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card header={<span>Top routes — 60s</span>}>
            <div style={{ padding: 0 }}>
              {(metrics?.topRoutes ?? []).slice(0, 8).map((r) => (
                <div key={r.routeId} style={{ display: 'flex', padding: '8px 13px', borderTop: '0.5px solid var(--border)', alignItems: 'center', gap: 8 }}>
                  <Link href={`/routes/${r.routeId}`} style={{ flex: 1, fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                    {routeMap[r.routeId] ?? r.routeId}
                  </Link>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{r.count} req</span>
                </div>
              ))}
              {!metrics?.topRoutes.length && (
                <div style={{ padding: '16px 13px', color: 'var(--text-dim)', fontSize: 11 }}>No traffic yet.</div>
              )}
            </div>
          </Card>
        </div>

        <Card header={<span>Top source IPs — 60s</span>}>
          <div style={{ padding: 0 }}>
            {(metrics?.topIps ?? []).slice(0, 10).map((r) => (
              <div key={r.ip} style={{ display: 'flex', padding: '8px 13px', borderTop: '0.5px solid var(--border)', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{r.ip}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{r.count} req</span>
              </div>
            ))}
            {!metrics?.topIps.length && (
              <div style={{ padding: '16px 13px', color: 'var(--text-dim)', fontSize: 11 }}>No traffic yet.</div>
            )}
          </div>
        </Card>
      </PageContent>
    </>
  )
}
