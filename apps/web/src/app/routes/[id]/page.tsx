'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Badge, Button, Card, DataTable, Dot, Input, Select, StatCard, td, th } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

export default function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const routes = trpc.routes.list.useQuery()
  const summary = trpc.analytics.summary.useQuery({ routeId: id, windowMinutes: 60 }, { refetchInterval: 5000 })
  const recent = trpc.analytics.recentRequests.useQuery({ routeId: id, limit: 25 }, { refetchInterval: 5000 })
  const route = routes.data?.find((r) => r.id === id)
  const chain = trpc.chain.getForRoute.useQuery({ routeId: id }, { refetchInterval: 30000 })
  const fixDns = trpc.chain.fixDns.useMutation({ onSuccess: () => chain.refetch() })
  const debugChain = trpc.chain.debugChain.useMutation()
  const [debugOpen, setDebugOpen] = useState(false)
  const [lbPolicy, setLbPolicy] = useState<string>('round_robin')
  const [upstreams, setUpstreams] = useState<{ address: string; weight: number }[]>([])
  const [lbMsg, setLbMsg] = useState('')
  const updateRoute = trpc.routes.update.useMutation()

  const [geoMode, setGeoMode] = useState<'allowlist' | 'blocklist'>('blocklist')
  const [geoCountries, setGeoCountries] = useState('')
  const [geoAction, setGeoAction] = useState<'block' | 'challenge'>('block')
  const [geoMsg, setGeoMsg] = useState('')
  const [geoTestCode, setGeoTestCode] = useState('')
  const geoipConfig = trpc.security.getGeoIPConfig.useQuery({ routeId: id })
  const setGeoIPConfig = trpc.security.setGeoIPConfig.useMutation({
    onSuccess: () => { setGeoMsg('Saved'); geoipConfig.refetch() },
    onError: (e) => setGeoMsg(`Error: ${e.message}`),
  })

  useEffect(() => {
    if (route) {
      setLbPolicy(route.lbPolicy ?? 'round_robin')
      setUpstreams(route.upstreams.map((u) => ({ address: u.address, weight: u.weight ?? 1 })))
    }
  }, [route])

  useEffect(() => {
    const cfg = geoipConfig.data?.config
    if (cfg) {
      setGeoMode(cfg.mode)
      setGeoCountries(cfg.countries.join(', '))
      setGeoAction(cfg.action)
    }
  }, [geoipConfig.data])

  return (
    <>
      <Topbar
        title={route?.domain ?? 'Route'}
        actions={<Link href="/routes" style={{ fontSize: 11, color: 'var(--pu-400)' }}>← Routes</Link>}
      />
      <PageContent>
        {route && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {route.name} →{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {route.upstreams.map((u) => u.address).join(', ')}
            </span>
            <span style={{ marginLeft: 8 }}>
              <Badge tone={route.tlsMode === 'off' ? 'red' : 'green'}>TLS: {route.tlsMode}</Badge>{' '}
              {route.ssoEnabled && <Badge tone="purple">SSO</Badge>}
            </span>
          </div>
        )}

        {/* Service chain */}
        {chain.data && chain.data.nodes.length > 0 && (
          <Card
            header={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Service chain
                  <Dot tone={chain.data.rollup === 'ok' ? 'green' : chain.data.rollup === 'warning' ? 'amber' : chain.data.rollup === 'error' ? 'red' : 'neutral'} />
                </span>
                <Button variant="ghost" style={{ fontSize: 10 }}
                  onClick={() => { setDebugOpen(true); debugChain.mutate({ routeId: id }) }}
                  disabled={debugChain.isPending}>
                  {debugChain.isPending ? 'Probing…' : 'Debug chain'}
                </Button>
              </div>
            }
            style={{ marginBottom: 8 }}
          >
            <div style={{ display: 'flex', gap: 0, alignItems: 'center', flexWrap: 'wrap' }}>
              {chain.data.nodes.map((node, i) => (
                <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
                  {i > 0 && <span style={{ color: 'var(--text-ghost)', margin: '0 6px', fontSize: 12 }}>→</span>}
                  <div style={{
                    padding: '6px 10px', borderRadius: 6, fontSize: 11,
                    background: 'var(--surface-2)',
                    border: `1px solid ${node.status === 'ok' ? 'var(--border)' : node.status === 'warning' ? 'color-mix(in srgb, var(--amber) 30%, transparent)' : 'color-mix(in srgb, var(--red) 30%, transparent)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      <Dot tone={node.status === 'ok' ? 'green' : node.status === 'warning' ? 'amber' : 'red'} />
                      <span style={{ fontWeight: 600 }}>{node.label}</span>
                      {node.provider && (
                        <span style={{ fontSize: 9, color: 'var(--text-ghost)', textTransform: 'uppercase' }}>
                          {node.provider}
                        </span>
                      )}
                    </div>
                    {node.detail && (
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        {node.detail}
                      </div>
                    )}
                    {node.warning && (
                      <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>⚠ {node.warning}</div>
                    )}
                    {node.nodeType === 'dns' && (node.status === 'error' || node.status === 'warning') && (
                      <Button variant="primary" style={{ fontSize: 10, padding: '2px 8px', marginTop: 4 }}
                        onClick={() => fixDns.mutate({ routeId: id })}
                        disabled={fixDns.isPending}>
                        {fixDns.isPending ? 'Fixing…' : 'Fix DNS'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Debug results */}
            {debugOpen && debugChain.data && (
              <div style={{ marginTop: 14, borderTop: '0.5px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>
                  Debug chain — {debugChain.data.overallOk ? <span style={{ color: 'var(--green)' }}>all steps passed</span> : <span style={{ color: 'var(--red)' }}>failures detected</span>}
                </div>
                {debugChain.data.steps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '0.5px solid var(--border)' }}>
                    <Dot tone={step.ok ? 'green' : 'red'} />
                    <span style={{ fontSize: 11, minWidth: 200 }}>{step.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{step.detail}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-ghost)', marginLeft: 'auto' }}>{step.latencyMs}ms</span>
                    {step.error && <span style={{ fontSize: 10, color: 'var(--red)' }}>{step.error}</span>}
                  </div>
                ))}
                <button onClick={() => setDebugOpen(false)} style={{ marginTop: 8, background: 'none', border: 0, color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                  Dismiss
                </button>
              </div>
            )}
          </Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <StatCard label="Requests (60m)" value={summary.data?.requests ?? 0} />
          <StatCard label="Errors (5xx)" value={summary.data?.status5xx ?? 0} subTone={(summary.data?.status5xx ?? 0) > 0 ? 'red' : 'green'} sub={(summary.data?.status5xx ?? 0) > 0 ? 'investigate' : 'none'} />
          <StatCard label="Avg latency" value={`${summary.data?.avgLatencyMs ?? 0} ms`} />
          <StatCard label="Bytes out" value={formatBytes(summary.data?.bytes ?? 0)} />
        </div>

        {/* Load balancing */}
        {route && (
          <Card header={<span>Load balancing</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>Policy</div>
              <Select
                value={lbPolicy}
                onChange={(e) => setLbPolicy(e.target.value)}
                style={{ width: 160, fontSize: 12 }}
              >
                <option value="round_robin">Round robin</option>
                <option value="least_conn">Least connections</option>
                <option value="ip_hash">IP hash</option>
                <option value="random">Random</option>
                <option value="first">First available</option>
              </Select>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
                {upstreams.length === 1 ? '— add more upstreams to enable' : `— ${upstreams.length} upstreams`}
              </span>
            </div>

            <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              {upstreams.map((u, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input
                    value={u.address}
                    placeholder="http://192.168.1.10:8080"
                    onChange={(e) => {
                      const next = [...upstreams]
                      next[i] = { ...next[i]!, address: e.target.value }
                      setUpstreams(next)
                    }}
                    style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>wt</span>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={u.weight}
                      onChange={(e) => {
                        const next = [...upstreams]
                        next[i] = { ...next[i]!, weight: Number(e.target.value) }
                        setUpstreams(next)
                      }}
                      style={{ width: 56, fontSize: 12, textAlign: 'center' }}
                    />
                  </div>
                  {upstreams.length > 1 && (
                    <button
                      onClick={() => setUpstreams(upstreams.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                      title="Remove upstream"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>

            {lbMsg && (
              <p style={{ fontSize: 11, color: lbMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font-sans)', margin: '0 0 8px' }}>{lbMsg}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="ghost"
                onClick={() => setUpstreams([...upstreams, { address: '', weight: 1 }])}
                style={{ fontSize: 11 }}
              >+ Add upstream</Button>
              <Button
                variant="primary"
                disabled={updateRoute.isPending || upstreams.some((u) => !u.address.trim())}
                onClick={() => {
                  updateRoute.mutate(
                    { id, patch: { upstreams: upstreams.map((u) => ({ address: u.address, weight: u.weight })), lbPolicy: lbPolicy as 'round_robin' | 'least_conn' | 'ip_hash' | 'random' | 'first' } },
                    {
                      onSuccess: () => { setLbMsg('Saved'); routes.refetch() },
                      onError: (e) => setLbMsg(`Error: ${e.message}`),
                    },
                  )
                }}
                style={{ fontSize: 11 }}
              >{updateRoute.isPending ? 'Saving…' : 'Save'}</Button>
            </div>
          </Card>
        )}

        {/* GeoIP blocking */}
        {route && (
          <Card header={<span>Geo-blocking</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>Mode</div>
              <Select value={geoMode} onChange={(e) => setGeoMode(e.target.value as 'allowlist' | 'blocklist')} style={{ width: 130, fontSize: 12 }}>
                <option value="blocklist">Blocklist</option>
                <option value="allowlist">Allowlist</option>
              </Select>
              <div style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>Action</div>
              <Select value={geoAction} onChange={(e) => setGeoAction(e.target.value as 'block' | 'challenge')} style={{ width: 120, fontSize: 12 }}>
                <option value="block">Block (403)</option>
                <option value="challenge">Challenge</option>
              </Select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
                Countries <span style={{ color: 'var(--text-dim)' }}>(ISO 3166-1 alpha-2, comma-separated)</span>
              </div>
              <Input
                value={geoCountries}
                onChange={(e) => setGeoCountries(e.target.value)}
                placeholder="CN, RU, KP"
                style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <Button variant="ghost" style={{ fontSize: 11 }}
                onClick={() => {
                  const preset = geoipConfig.data?.highRiskPreset ?? ['CN', 'RU', 'KP', 'IR', 'BY', 'SY', 'CU', 'VE']
                  setGeoCountries(preset.join(', '))
                }}>
                Use high-risk preset
              </Button>
              {geoCountries && (
                <Button variant="ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                  onClick={() => {
                    setGeoIPConfig.mutate({ routeId: id, config: null })
                    setGeoCountries('')
                    setGeoMsg('')
                  }}
                  disabled={setGeoIPConfig.isPending}>
                  Clear rule
                </Button>
              )}
            </div>
            {geoMsg && (
              <p style={{ fontSize: 11, color: geoMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)', margin: '0 0 8px' }}>{geoMsg}</p>
            )}
            <Button
              variant="primary"
              disabled={setGeoIPConfig.isPending || !geoCountries.trim()}
              onClick={() => {
                const countries = geoCountries.split(',').map((s) => s.trim().toUpperCase()).filter((s) => s.length === 2)
                if (countries.length === 0) { setGeoMsg('Error: enter valid 2-letter country codes'); return }
                setGeoIPConfig.mutate({ routeId: id, config: { mode: geoMode, countries, action: geoAction } })
              }}
              style={{ fontSize: 11 }}
            >{setGeoIPConfig.isPending ? 'Saving…' : 'Save'}</Button>

            {/* Rule tester */}
            {geoCountries.trim() && (() => {
              const countries = geoCountries.split(',').map((s) => s.trim().toUpperCase()).filter((s) => s.length === 2)
              const code = geoTestCode.trim().toUpperCase()
              const inList = countries.includes(code)
              const wouldBlock = geoMode === 'blocklist' ? inList : !inList
              return (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>Test rule</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input
                      value={geoTestCode}
                      onChange={(e) => setGeoTestCode(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2))}
                      placeholder="XX"
                      style={{ width: 64, fontSize: 13, fontFamily: 'var(--font-mono)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                    />
                    {code.length === 2 && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: wouldBlock ? 'var(--red)' : 'var(--green)',
                        fontFamily: 'var(--font-sans)',
                      }}>
                        {wouldBlock ? `✕ ${code} would be ${geoAction === 'block' ? 'blocked (403)' : 'challenged'}` : `✓ ${code} would be allowed`}
                      </span>
                    )}
                    {code.length === 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>enter a 2-letter country code to simulate</span>
                    )}
                  </div>
                </div>
              )
            })()}
          </Card>
        )}

        <Card header={<span>Recent requests</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '16%' }}>Time</th>
                <th style={{ ...th, width: '8%' }}>Method</th>
                <th style={{ ...th, width: '38%' }}>Path</th>
                <th style={{ ...th, width: '10%' }}>Status</th>
                <th style={{ ...th, width: '10%' }}>Latency</th>
                <th style={{ ...th, width: '18%' }}>Client</th>
              </tr>
            </thead>
            <tbody>
              {recent.data?.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)', padding: '24px 12px' }}>No requests yet.</td></tr>
              )}
              {recent.data?.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{new Date(r.recordedAt).toLocaleTimeString()}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{r.method}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--pu-400)' }}>{r.path}</td>
                  <td style={td}><Badge tone={statusTone(r.statusCode ?? 0)}>{r.statusCode}</Badge></td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.latencyMs}ms</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{r.clientIp}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </PageContent>
    </>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
function statusTone(code: number): 'green' | 'amber' | 'red' | 'neutral' {
  if (code >= 500) return 'red'
  if (code >= 400) return 'amber'
  if (code >= 300) return 'neutral'
  return 'green'
}
