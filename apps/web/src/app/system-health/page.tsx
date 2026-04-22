'use client'

import { Badge, Card, Dot } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy' | 'n/a'

function statusTone(status: ComponentStatus): 'green' | 'amber' | 'red' | 'neutral' {
  if (status === 'healthy') return 'green'
  if (status === 'degraded') return 'amber'
  if (status === 'unhealthy') return 'red'
  return 'neutral'
}

function overallBadgeTone(overall: string): 'green' | 'amber' | 'red' | 'neutral' {
  if (overall === 'healthy') return 'green'
  if (overall === 'degraded') return 'amber'
  if (overall === 'unhealthy') return 'red'
  return 'neutral'
}

function formatSeconds(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  return `${m}m ${sec}s`
}

interface ComponentData {
  status: ComponentStatus
  [key: string]: unknown
}

function ComponentCard({ name, data }: { name: string; data: ComponentData }) {
  const tone = statusTone(data.status)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '14px 16px',
        border: '0.5px solid var(--border)',
        borderRadius: 8,
        background: 'var(--surf)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Dot tone={tone} />
        <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
          {name}
        </span>
        <Badge tone={tone === 'neutral' ? 'neutral' : tone}>{data.status}</Badge>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', paddingLeft: 15 }}>
        {Object.entries(data)
          .filter(([k]) => k !== 'status')
          .map(([k, v]) => (
            <span key={k} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
              {k}: <span style={{ color: 'var(--text)' }}>{String(v)}</span>
            </span>
          ))}
      </div>
    </div>
  )
}

const COMPONENT_LABELS: Record<string, string> = {
  database: 'Database',
  caddy_admin: 'Caddy admin API',
  docker: 'Docker',
  auth: 'Auth secret',
  disk: 'Disk',
  federation: 'Federation',
}

export default function SystemHealthPage() {
  const { data, dataUpdatedAt, isLoading, isError } = trpc.system.getDetailedHealth.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  )

  const lastChecked = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null

  return (
    <>
      <Topbar title="System health" />
      <PageContent>
        {isLoading && (
          <div style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--font-sans)' }}>
            Loading…
          </div>
        )}
        {isError && (
          <div style={{ fontSize: 13, color: 'var(--red)', fontFamily: 'var(--font-sans)' }}>
            Failed to load health data. You may not have admin access.
          </div>
        )}
        {data && (
          <>
            {/* Overall status + meta */}
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--text2)' }}>Overall</span>
                  <Badge tone={overallBadgeTone(data.overall)}>{data.overall}</Badge>
                </div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                  version: <span style={{ color: 'var(--text)' }}>{data.version}</span>
                </div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                  uptime: <span style={{ color: 'var(--text)' }}>{formatSeconds(data.uptime_seconds)}</span>
                </div>
                {lastChecked && (
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-sans)', color: 'var(--text3)', marginLeft: 'auto' }}>
                    Last checked {lastChecked} (auto-refreshes every 30s)
                  </div>
                )}
              </div>
            </Card>

            {/* Component cards */}
            <div style={{ display: 'grid', gap: 8 }}>
              {Object.entries(data.components).map(([key, component]) => (
                <ComponentCard
                  key={key}
                  name={COMPONENT_LABELS[key] ?? key}
                  data={component as ComponentData}
                />
              ))}
            </div>
          </>
        )}
      </PageContent>
    </>
  )
}
