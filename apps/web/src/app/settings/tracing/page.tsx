'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button, Card, Input, Toggle } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function TracingPage() {
  const utils = trpc.useUtils()
  const config = trpc.observability.getTraceConfig.useQuery()
  const save = trpc.observability.setTraceConfig.useMutation({
    onSuccess: () => utils.observability.getTraceConfig.invalidate(),
  })

  const [enabled, setEnabled] = useState(false)
  const [headerName, setHeaderName] = useState('X-Request-ID')
  const [generateIfMissing, setGenerateIfMissing] = useState(true)
  const [logFormat, setLogFormat] = useState<'json' | 'text'>('json')

  useEffect(() => {
    if (!config.data) return
    setEnabled(config.data.enabled)
    setHeaderName(config.data.headerName)
    setGenerateIfMissing(config.data.generateIfMissing)
    setLogFormat(config.data.logFormat)
  }, [config.data])

  return (
    <>
      <Topbar
        title="Request tracing"
        actions={<Link href="/settings" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Settings</Link>}
      />
      <PageContent>
        <Card header={<span>X-Request-ID tracing</span>}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Enable request tracing</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Attach a request ID to every access log entry for cross-service tracing</div>
              </div>
              <Toggle checked={enabled} onChange={setEnabled} />
            </div>

            {enabled && (
              <>
                <Field label="Header name">
                  <Input value={headerName} onChange={e => setHeaderName(e.target.value)} placeholder="X-Request-ID" />
                </Field>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12 }}>Generate if missing</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Generate a UUID if the request doesn&apos;t include the header</div>
                  </div>
                  <Toggle checked={generateIfMissing} onChange={setGenerateIfMissing} />
                </div>

                <Field label="Log format">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['json', 'text'] as const).map(f => (
                      <button key={f} onClick={() => setLogFormat(f)}
                        style={{ padding: '4px 14px', borderRadius: 4, border: `1px solid ${logFormat === f ? 'var(--pu-400)' : 'var(--border)'}`, background: logFormat === f ? 'var(--pu-400)' : 'transparent', color: logFormat === f ? '#fff' : 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
                        {f}
                      </button>
                    ))}
                  </div>
                </Field>
              </>
            )}

            <Button variant="primary" onClick={() => save.mutate({ enabled, headerName, generateIfMissing, logFormat })} disabled={save.isPending}>
              Save
            </Button>
          </div>
        </Card>

        <Card header={<span>Prometheus metrics</span>} style={{ marginTop: 8 }}>
          <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
            <div style={{ color: 'var(--text-secondary)' }}>
              ProxyOS exposes a Prometheus scrape endpoint at <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>/api/metrics</code>.
            </div>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>Metrics exported</div>
              <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                {[
                  'proxyos_route_requests_total — requests by route and status class',
                  'proxyos_route_request_duration_seconds — avg latency by route',
                  'proxyos_route_bytes_total — bytes transferred by route',
                  'proxyos_route_upstream_health — route enabled/healthy',
                  'proxyos_agent_status — agent online/offline',
                  'proxyos_agent_routes_total — routes per agent',
                  'proxyos_cert_expiry_days — days until cert expires',
                  'proxyos_connection_status — connection health',
                ].map(m => <div key={m} style={{ fontFamily: 'var(--font-mono)' }}>{m}</div>)}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Set <code style={{ fontFamily: 'var(--font-mono)' }}>METRICS_TOKEN</code> environment variable to require Bearer token authentication on the scrape endpoint.
            </div>
            <a href="/api/metrics" target="_blank" rel="noopener noreferrer">
              <Button size="sm">View /api/metrics</Button>
            </a>
          </div>
        </Card>

        <Card header={<span>Grafana dashboard</span>} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            A pre-built Grafana dashboard is bundled with ProxyOS. Download it and import via Grafana → Dashboards → Import → Upload JSON file.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/api/grafana-dashboard" download="proxyos-grafana-dashboard.json">
              <Button size="sm" variant="primary">Download dashboard JSON</Button>
            </a>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Configure the <code style={{ fontFamily: 'var(--font-mono)' }}>DS_PROMETHEUS</code> data source to point at your ProxyOS <code style={{ fontFamily: 'var(--font-mono)' }}>/api/metrics</code> endpoint after import.
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
