'use client'

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

  const healthHistory = trpc.healthChecks.listByRoute.useQuery({ routeId: id, limit: 50 })
  const versionHistory = trpc.routeVersions.listByRoute.useQuery({ routeId: id })
  const rollbackMut = trpc.routeVersions.rollback.useMutation({
    onSuccess: () => { routes.refetch(); versionHistory.refetch() },
  })
  const [versionMsg, setVersionMsg] = useState('')

  const [stagingUpstreams, setStagingUpstreams] = useState('')
  const [trafficSplitPct, setTrafficSplitPct] = useState(10)
  const [blueGreenMsg, setBlueGreenMsg] = useState('')
  const [mirrorUpstream, setMirrorUpstream] = useState('')
  const [mirrorSampleRate, setMirrorSampleRate] = useState(100)
  const [mirrorMsg, setMirrorMsg] = useState('')

  const [accessosGroups, setAccessosGroups] = useState('')
  const [accessosMsg, setAccessosMsg] = useState('')
  const accessosConfig = trpc.accessos.getConfig.useQuery({ routeId: id })
  const accessosProviders = trpc.accessos.listProviders.useQuery()
  const [accessosProviderId, setAccessosProviderId] = useState('')

  const mxwatchData = trpc.mxwatch.getForRoute.useQuery({ routeId: id })
  const [mxwatchDomain, setMxwatchDomain] = useState('')
  const [mxwatchMsg, setMxwatchMsg] = useState('')
  const setMxwatchDomainMut = trpc.mxwatch.setDomain.useMutation({
    onSuccess: () => { setMxwatchMsg('Saved'); mxwatchData.refetch() },
    onError: e => setMxwatchMsg(`Error: ${e.message}`),
  })

  const patchosStatus = trpc.patchos.getStatus.useQuery({ routeId: id })
  const setMaintenanceMut = trpc.patchos.setMaintenance.useMutation({
    onSuccess: () => { patchosStatus.refetch(); routes.refetch() },
  })
  const restoreMut = trpc.patchos.restore.useMutation({
    onSuccess: () => { patchosStatus.refetch(); routes.refetch() },
  })
  const [maintenanceUrl, setMaintenanceUrl] = useState('')
  const [maintenanceMsg, setMaintenanceMsg] = useState('')

  const [forceSSL, setForceSSL] = useState(false)
  const [hstsEnabled, setHstsEnabled] = useState(false)
  const [hstsSubdomains, setHstsSubdomains] = useState(false)
  const [http2Enabled, setHttp2Enabled] = useState(true)
  const [trustUpstreamHeaders, setTrustUpstreamHeaders] = useState(false)
  const [sslMsg, setSslMsg] = useState('')

  const [geoMode, setGeoMode] = useState<'allowlist' | 'blocklist'>('blocklist')
  const [geoCountries, setGeoCountries] = useState('')
  const [geoAction, setGeoAction] = useState<'block' | 'challenge'>('block')
  const [geoMsg, setGeoMsg] = useState('')
  const [geoTestCode, setGeoTestCode] = useState('')
  const geoipConfig = trpc.security.getGeoIPConfig.useQuery({ routeId: id })

  const [mtlsCaCert, setMtlsCaCert] = useState('')
  const [mtlsRequire, setMtlsRequire] = useState(true)
  const [mtlsMsg, setMtlsMsg] = useState('')
  const mtlsConfig = trpc.security.getMTLSConfig.useQuery({ routeId: id })
  const setMTLSConfig = trpc.security.setMTLSConfig.useMutation({
    onSuccess: () => { setMtlsMsg('Saved'); mtlsConfig.refetch() },
    onError: (e) => setMtlsMsg(`Error: ${e.message}`),
  })

  const [botProvider, setBotProvider] = useState<'turnstile' | 'hcaptcha'>('turnstile')
  const [botSiteKey, setBotSiteKey] = useState('')
  const [botSecretKey, setBotSecretKey] = useState('')
  const [botSkipPaths, setBotSkipPaths] = useState('')
  const [botMsg, setBotMsg] = useState('')
  const botChallengeConfig = trpc.security.getBotChallengeConfig.useQuery({ routeId: id })
  const setBotChallengeConfig = trpc.security.setBotChallengeConfig.useMutation({
    onSuccess: () => { setBotMsg('Saved'); botChallengeConfig.refetch() },
    onError: (e) => setBotMsg(`Error: ${e.message}`),
  })
  const setGeoIPConfig = trpc.security.setGeoIPConfig.useMutation({
    onSuccess: () => { setGeoMsg('Saved'); geoipConfig.refetch() },
    onError: (e) => setGeoMsg(`Error: ${e.message}`),
  })

  useEffect(() => {
    if (route) {
      setLbPolicy(route.lbPolicy ?? 'round_robin')
      setUpstreams(route.upstreams.map((u) => ({ address: u.address, weight: u.weight ?? 1 })))
      setStagingUpstreams(route.stagingUpstreams?.map(u => u.address).join(', ') ?? '')
      setTrafficSplitPct(route.trafficSplitPct ?? 10)
      setMirrorUpstream(route.mirrorUpstream ?? '')
      setMirrorSampleRate(route.mirrorSampleRate ?? 100)
      setMxwatchDomain(route.mxwatchDomain ?? '')
      setForceSSL(route.forceSSL ?? false)
      setHstsEnabled(route.hstsEnabled ?? false)
      setHstsSubdomains(route.hstsSubdomains ?? false)
      setHttp2Enabled(route.http2Enabled ?? true)
      setTrustUpstreamHeaders(route.trustUpstreamHeaders ?? false)
    }
  }, [route])

  useEffect(() => {
    if (accessosConfig.data) {
      setAccessosGroups(accessosConfig.data.groups?.join(', ') ?? '')
      setAccessosProviderId(accessosConfig.data.providerId ?? '')
    }
  }, [accessosConfig.data])

  useEffect(() => {
    const cfg = geoipConfig.data?.config
    if (cfg) {
      setGeoMode(cfg.mode)
      setGeoCountries(cfg.countries.join(', '))
      setGeoAction(cfg.action)
    }
  }, [geoipConfig.data])

  useEffect(() => {
    const cfg = mtlsConfig.data?.config
    if (cfg) {
      setMtlsCaCert(cfg.caCert ?? '')
      setMtlsRequire(cfg.requireClientCert ?? true)
    }
  }, [mtlsConfig.data])

  useEffect(() => {
    const cfg = botChallengeConfig.data?.config
    if (cfg) {
      setBotProvider(cfg.provider ?? 'turnstile')
      setBotSiteKey(cfg.siteKey ?? '')
      setBotSecretKey(cfg.secretKey ?? '')
      setBotSkipPaths(cfg.skipPaths?.join(', ') ?? '')
    }
  }, [botChallengeConfig.data])

  // §9.4 A/B traffic split
  const trafficSplitQuery = trpc.intelligence.getTrafficSplit.useQuery({ routeId: id })
  const setTrafficSplitMut = trpc.intelligence.setTrafficSplit.useMutation({
    onSuccess: () => { setAbMsg('Saved'); trafficSplitQuery.refetch() },
    onError: (e) => setAbMsg(`Error: ${e.message}`),
  })
  const [abUpstreams, setAbUpstreams] = useState<{ address: string; weight: number; label: string }[]>([])
  const [abMsg, setAbMsg] = useState('')

  useEffect(() => {
    if (trafficSplitQuery.data) setAbUpstreams(trafficSplitQuery.data.upstreams)
  }, [trafficSplitQuery.data])

  // §9.5 Route rules
  const routeRulesQuery = trpc.intelligence.listRouteRules.useQuery({ routeId: id })
  const createRuleMut = trpc.intelligence.createRouteRule.useMutation({ onSuccess: () => { setRulesMsg('Rule added'); routeRulesQuery.refetch() }, onError: (e) => setRulesMsg(`Error: ${e.message}`) })
  const updateRuleMut = trpc.intelligence.updateRouteRule.useMutation({ onSuccess: () => routeRulesQuery.refetch() })
  const deleteRuleMut = trpc.intelligence.deleteRouteRule.useMutation({ onSuccess: () => routeRulesQuery.refetch() })
  const [ruleMatcherType, setRuleMatcherType] = useState<'path' | 'header' | 'query' | 'method'>('path')
  const [ruleMatcherKey, setRuleMatcherKey] = useState('')
  const [ruleMatcherValue, setRuleMatcherValue] = useState('')
  const [ruleAction, setRuleAction] = useState<'upstream' | 'redirect' | 'static'>('upstream')
  const [ruleTarget, setRuleTarget] = useState('')
  const [rulePriority, setRulePriority] = useState(0)
  const [rulesMsg, setRulesMsg] = useState('')

  // §9.6 Transforms
  const [pathStrip, setPathStrip] = useState('')
  const [pathAdd, setPathAdd] = useState('')
  const [transformMsg, setTransformMsg] = useState('')
  const [corsPreset, setCorsPreset] = useState<'permissive' | 'restrictive' | 'custom'>('permissive')
  const [corsOrigins, setCorsOrigins] = useState('')
  const [corsMsg, setCorsMsg] = useState('')

  useEffect(() => {
    if (!route) return
    const pr = route.pathRewrite as { strip?: string; add?: string } | null | undefined
    if (pr) { setPathStrip(pr.strip ?? ''); setPathAdd(pr.add ?? '') }
    const cc = route.corsConfig as { preset?: string; allowOrigins?: string[] } | null | undefined
    if (cc) { setCorsPreset((cc.preset ?? 'permissive') as typeof corsPreset); setCorsOrigins(cc.allowOrigins?.join(', ') ?? '') }
  }, [route])

  // §9.8 Slow requests
  const slowReqs = trpc.analytics.slowRequests.useQuery({ routeId: id, thresholdMs: 1000, limit: 50 }, { refetchInterval: 15000 })

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: '10px 0' }}>
              {chain.data.nodes.map((node, i) => {
                const statusColor = node.status === 'ok' ? 'var(--green)' : node.status === 'warning' ? 'var(--amber)' : 'var(--red)'
                return (
                  <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {i > 0 && (
                      <div style={{
                        height: 1,
                        flex: 1,
                        minWidth: 16,
                        width: 24,
                        background: 'var(--border2)',
                        marginTop: -18,
                        flexShrink: 0,
                      }} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64, padding: '0 4px' }}>
                      <div style={{ position: 'relative' }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'var(--surf2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 600, color: 'var(--text2)',
                          fontFamily: 'var(--font-sans)',
                          border: '1px solid var(--border)',
                        }}>
                          {(node.label ?? '?')[0]?.toUpperCase()}
                        </div>
                        <div style={{
                          position: 'absolute', top: -2, right: -2,
                          width: 6, height: 6, borderRadius: '50%',
                          background: statusColor,
                          border: '1px solid var(--surf)',
                        }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', textAlign: 'center', whiteSpace: 'nowrap', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {node.label}
                      </span>
                      {node.warning && (
                        <span style={{ fontSize: 9, color: 'var(--amber)', textAlign: 'center' }}>⚠</span>
                      )}
                      {node.nodeType === 'dns' && (node.status === 'error' || node.status === 'warning') && (
                        <Button variant="primary" style={{ fontSize: 9, padding: '1px 6px' }}
                          onClick={() => fixDns.mutate({ routeId: id })}
                          disabled={fixDns.isPending}>
                          {fixDns.isPending ? '…' : 'Fix'}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
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

        {/* mTLS — mutual TLS client authentication */}
        {route && (
          <Card header={<span>mTLS — client certificate authentication</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                Require clients to present a valid certificate signed by your CA. Config is stored and applied on next Caddy reload.
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>CA certificate (PEM)</div>
                <textarea
                  value={mtlsCaCert}
                  onChange={e => setMtlsCaCert(e.target.value)}
                  placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
                  rows={5}
                  style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Require client certificate</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Block connections without a valid client cert</div>
                </div>
                <button
                  onClick={() => setMtlsRequire(!mtlsRequire)}
                  style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 12, border: 'none', background: mtlsRequire ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}
                >
                  <span style={{ position: 'absolute', top: 3, left: mtlsRequire ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button variant="primary" style={{ fontSize: 11 }}
                  disabled={setMTLSConfig.isPending || !mtlsCaCert.trim()}
                  onClick={() => setMTLSConfig.mutate({ routeId: id, config: { caCert: mtlsCaCert.trim(), requireClientCert: mtlsRequire } })}>
                  {setMTLSConfig.isPending ? 'Saving…' : 'Save'}
                </Button>
                {mtlsConfig.data?.config && (
                  <Button variant="ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                    disabled={setMTLSConfig.isPending}
                    onClick={() => { setMTLSConfig.mutate({ routeId: id, config: null }); setMtlsCaCert('') }}>
                    Clear
                  </Button>
                )}
                {mtlsMsg && <span style={{ fontSize: 11, color: mtlsMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{mtlsMsg}</span>}
              </div>
              {mtlsConfig.data?.config && (
                <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 8px', borderRadius: 4 }}>
                  Active — {mtlsConfig.data.config.requireClientCert ? 'strict (cert required)' : 'permissive (cert optional)'}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Bot challenge */}
        {route && (
          <Card header={<span>Bot challenge (Turnstile / hCaptcha)</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                Challenge suspected bots before allowing access. Requires a Cloudflare Turnstile or hCaptcha account.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Provider</div>
                  <Select value={botProvider} onChange={e => setBotProvider(e.target.value as 'turnstile' | 'hcaptcha')} style={{ width: '100%', fontSize: 12 }}>
                    <option value="turnstile">Cloudflare Turnstile</option>
                    <option value="hcaptcha">hCaptcha</option>
                  </Select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Site key</div>
                  <Input value={botSiteKey} onChange={e => setBotSiteKey(e.target.value)} placeholder="0x4AAAAAAA…" style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Secret key</div>
                  <Input type="password" value={botSecretKey} onChange={e => setBotSecretKey(e.target.value)} placeholder="Secret key" style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Skip paths (comma-separated)</div>
                  <Input value={botSkipPaths} onChange={e => setBotSkipPaths(e.target.value)} placeholder="/api/, /health" style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button variant="primary" style={{ fontSize: 11 }}
                  disabled={setBotChallengeConfig.isPending || !botSiteKey.trim() || !botSecretKey.trim()}
                  onClick={() => {
                    const skipPaths = botSkipPaths.split(',').map(s => s.trim()).filter(Boolean)
                    setBotChallengeConfig.mutate({ routeId: id, config: { provider: botProvider, siteKey: botSiteKey.trim(), secretKey: botSecretKey.trim(), skipPaths } })
                  }}>
                  {setBotChallengeConfig.isPending ? 'Saving…' : 'Save'}
                </Button>
                {botChallengeConfig.data?.config && (
                  <Button variant="ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                    disabled={setBotChallengeConfig.isPending}
                    onClick={() => { setBotChallengeConfig.mutate({ routeId: id, config: null }); setBotSiteKey(''); setBotSecretKey(''); setBotSkipPaths('') }}>
                    Clear
                  </Button>
                )}
                {botMsg && <span style={{ fontSize: 11, color: botMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{botMsg}</span>}
              </div>
              {botChallengeConfig.data?.config && (
                <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 8px', borderRadius: 4 }}>
                  Active: {botChallengeConfig.data.config.provider} · {botChallengeConfig.data.config.skipPaths?.length ?? 0} paths excluded
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Blue-green deployment */}
        {route && (
          <Card header={<span>Blue-green deployment</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                Send a percentage of traffic to staging upstreams. Set to 0 to disable.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Staging upstreams (comma-separated)</div>
                  <Input
                    value={stagingUpstreams}
                    onChange={e => setStagingUpstreams(e.target.value)}
                    placeholder="host:port, host2:port"
                    style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Traffic to staging (%)</div>
                  <Input
                    type="number"
                    value={trafficSplitPct}
                    onChange={e => setTrafficSplitPct(Number(e.target.value))}
                    style={{ width: 80, fontSize: 12 }}
                    min={0}
                    max={100}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button variant="primary" style={{ fontSize: 11 }}
                  onClick={() => {
                    const parsed = stagingUpstreams
                      ? stagingUpstreams.split(',').map(s => ({ address: s.trim() })).filter(u => u.address)
                      : null
                    updateRoute.mutate(
                      { id, patch: { stagingUpstreams: parsed, trafficSplitPct: parsed ? trafficSplitPct : null } },
                      {
                        onSuccess: () => { setBlueGreenMsg('Saved'); routes.refetch() },
                        onError: e => setBlueGreenMsg(`Error: ${e.message}`),
                      }
                    )
                  }}
                  disabled={updateRoute.isPending}>
                  {updateRoute.isPending ? 'Saving…' : 'Save'}
                </Button>
                {stagingUpstreams && (
                  <Button variant="ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                    onClick={() => {
                      updateRoute.mutate(
                        { id, patch: { stagingUpstreams: null, trafficSplitPct: null } },
                        {
                          onSuccess: () => { setStagingUpstreams(''); setBlueGreenMsg('Cleared'); routes.refetch() },
                          onError: e => setBlueGreenMsg(`Error: ${e.message}`),
                        }
                      )
                    }}>
                    Clear
                  </Button>
                )}
                {blueGreenMsg && <span style={{ fontSize: 11, color: blueGreenMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{blueGreenMsg}</span>}
              </div>
              {route.stagingUpstreams && route.stagingUpstreams.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 8px', borderRadius: 4 }}>
                  Active: {route.trafficSplitPct}% → {route.stagingUpstreams.map(u => u.address).join(', ')}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Mirror / shadow traffic */}
        {route && (
          <Card header={<span>Shadow traffic (mirror)</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                Mirror a sample of requests to a secondary upstream without affecting live traffic.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Mirror upstream</div>
                  <Input
                    value={mirrorUpstream}
                    onChange={e => setMirrorUpstream(e.target.value)}
                    placeholder="host:port"
                    style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Sample rate (%)</div>
                  <Input
                    type="number"
                    value={mirrorSampleRate}
                    onChange={e => setMirrorSampleRate(Number(e.target.value))}
                    style={{ width: 80, fontSize: 12 }}
                    min={1}
                    max={100}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button variant="primary" style={{ fontSize: 11 }}
                  onClick={() => {
                    updateRoute.mutate(
                      { id, patch: { mirrorUpstream: mirrorUpstream || null, mirrorSampleRate: mirrorUpstream ? mirrorSampleRate : null } },
                      {
                        onSuccess: () => { setMirrorMsg('Saved'); routes.refetch() },
                        onError: e => setMirrorMsg(`Error: ${e.message}`),
                      }
                    )
                  }}
                  disabled={updateRoute.isPending}>
                  {updateRoute.isPending ? 'Saving…' : 'Save'}
                </Button>
                {route.mirrorUpstream && (
                  <Button variant="ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                    onClick={() => {
                      updateRoute.mutate(
                        { id, patch: { mirrorUpstream: null, mirrorSampleRate: null } },
                        {
                          onSuccess: () => { setMirrorUpstream(''); setMirrorMsg('Cleared'); routes.refetch() },
                          onError: e => setMirrorMsg(`Error: ${e.message}`),
                        }
                      )
                    }}>
                    Clear
                  </Button>
                )}
                {mirrorMsg && <span style={{ fontSize: 11, color: mirrorMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{mirrorMsg}</span>}
              </div>
              {route.mirrorUpstream && (
                <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 8px', borderRadius: 4 }}>
                  Active: {route.mirrorSampleRate ?? 100}% of traffic → {route.mirrorUpstream}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* AccessOS group ACLs */}
        {route && (
          <Card header={<span>AccessOS — group-based access control</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                Gate this route by AccessOS group membership. Users must be in all listed groups after OIDC login.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Required groups (comma-separated)</div>
                  <Input
                    value={accessosGroups}
                    onChange={e => setAccessosGroups(e.target.value)}
                    placeholder="developers, admins"
                    style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>OIDC provider (AccessOS)</div>
                  <Select value={accessosProviderId} onChange={e => setAccessosProviderId(e.target.value)} style={{ width: '100%', fontSize: 12 }}>
                    <option value="">None</option>
                    {accessosProviders.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button variant="primary" style={{ fontSize: 11 }}
                  onClick={() => {
                    const groups = accessosGroups.split(',').map(s => s.trim()).filter(Boolean)
                    updateRoute.mutate(
                      { id, patch: { accessosGroups: groups.length ? groups : null, accessosProviderId: accessosProviderId || null } },
                      {
                        onSuccess: () => { setAccessosMsg('Saved'); routes.refetch(); accessosConfig.refetch() },
                        onError: e => setAccessosMsg(`Error: ${e.message}`),
                      }
                    )
                  }}
                  disabled={updateRoute.isPending}>
                  {updateRoute.isPending ? 'Saving…' : 'Save'}
                </Button>
                {(accessosGroups || accessosProviderId) && (
                  <Button variant="ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                    onClick={() => {
                      updateRoute.mutate(
                        { id, patch: { accessosGroups: null, accessosProviderId: null } },
                        {
                          onSuccess: () => { setAccessosGroups(''); setAccessosProviderId(''); setAccessosMsg('Cleared'); routes.refetch() },
                          onError: e => setAccessosMsg(`Error: ${e.message}`),
                        }
                      )
                    }}>
                    Clear
                  </Button>
                )}
                {accessosMsg && <span style={{ fontSize: 11, color: accessosMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{accessosMsg}</span>}
              </div>
              {route.accessosGroups && route.accessosGroups.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 8px', borderRadius: 4 }}>
                  Active: requires groups [{route.accessosGroups.join(', ')}]
                </div>
              )}
            </div>
          </Card>
        )}

        {/* MxWatch mail deliverability */}
        {route && (
          <Card header={<span>MxWatch — mail deliverability</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                Associate this route with a mail domain to show MxWatch deliverability data inline.
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Mail domain</div>
                  <Input
                    value={mxwatchDomain}
                    onChange={e => setMxwatchDomain(e.target.value)}
                    placeholder="mail.example.com"
                    style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <Button variant="primary" style={{ fontSize: 11 }}
                  onClick={() => setMxwatchDomainMut.mutate({ routeId: id, domain: mxwatchDomain || null })}
                  disabled={setMxwatchDomainMut.isPending}>
                  Save
                </Button>
                {route.mxwatchDomain && (
                  <Button variant="ghost" style={{ fontSize: 11, color: 'var(--red)' }}
                    onClick={() => setMxwatchDomainMut.mutate({ routeId: id, domain: null })}>
                    Clear
                  </Button>
                )}
              </div>
              {mxwatchMsg && <span style={{ fontSize: 11, color: mxwatchMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{mxwatchMsg}</span>}
              {mxwatchData.data?.deliverability && (() => {
                const d = mxwatchData.data!.deliverability!
                return (
                  <div style={{ background: 'var(--surface2)', borderRadius: 4, padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: (d.score ?? 0) >= 80 ? 'var(--green)' : (d.score ?? 0) >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                        {d.score ?? '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>Score</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <Badge tone={d.rblListed ? 'red' : 'green'}>{d.rblListed ? 'RBL listed' : 'RBL clean'}</Badge>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <Badge tone={d.dkimPass ? 'green' : d.dkimPass === false ? 'red' : 'neutral'}>DKIM {d.dkimPass ? '✓' : d.dkimPass === false ? '✗' : '?'}</Badge>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <Badge tone={d.spfPass ? 'green' : d.spfPass === false ? 'red' : 'neutral'}>SPF {d.spfPass ? '✓' : d.spfPass === false ? '✗' : '?'}</Badge>
                    </div>
                  </div>
                )
              })()}
              {route.mxwatchDomain && !mxwatchData.data?.deliverability && (
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Awaiting MxWatch data for {route.mxwatchDomain}.</div>
              )}
            </div>
          </Card>
        )}

        {/* PatchOS maintenance mode */}
        {route && (
          <Card header={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>PatchOS — maintenance mode</span>
              {patchosStatus.data?.maintenanceMode && <Badge tone="amber">ACTIVE</Badge>}
            </div>
          }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                Switch this route to a maintenance page during service updates. PatchOS can toggle this automatically via the API.
              </div>
              {patchosStatus.data?.maintenanceMode ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button variant="primary" style={{ fontSize: 11 }}
                    onClick={() => restoreMut.mutate({ routeId: id }, {
                      onSuccess: () => setMaintenanceMsg('Route restored'),
                      onError: e => setMaintenanceMsg(`Error: ${e.message}`),
                    })}
                    disabled={restoreMut.isPending}>
                    {restoreMut.isPending ? 'Restoring…' : 'Restore route'}
                  </Button>
                  {maintenanceMsg && <span style={{ fontSize: 11, color: maintenanceMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{maintenanceMsg}</span>}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Maintenance page URL</div>
                    <Input
                      value={maintenanceUrl}
                      onChange={e => setMaintenanceUrl(e.target.value)}
                      placeholder="http://maintenance.internal:8080"
                      style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                  <Button variant="ghost" style={{ fontSize: 11, color: 'var(--amber)' }}
                    onClick={() => setMaintenanceMut.mutate({ routeId: id, maintenanceUrl }, {
                      onSuccess: () => setMaintenanceMsg('Maintenance mode active'),
                      onError: e => setMaintenanceMsg(`Error: ${e.message}`),
                    })}
                    disabled={!maintenanceUrl || setMaintenanceMut.isPending}>
                    {setMaintenanceMut.isPending ? 'Setting…' : 'Set maintenance'}
                  </Button>
                  {maintenanceMsg && <span style={{ fontSize: 11, color: maintenanceMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{maintenanceMsg}</span>}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Health check history */}
        <Card header={<span>Health check history — last {healthHistory.data?.length ?? 0} checks</span>}>
          {(!healthHistory.data || healthHistory.data.length === 0) ? (
            <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text3)' }}>No health checks recorded yet.</div>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th style={{ ...th, width: '26%' }}>Time</th>
                  <th style={{ ...th, width: '14%' }}>Status</th>
                  <th style={{ ...th, width: '14%' }}>HTTP</th>
                  <th style={{ ...th, width: '16%' }}>Latency</th>
                  <th style={{ ...th }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {healthHistory.data.slice(0, 20).map((h) => (
                  <tr key={h.id}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>
                      {new Date(h.checkedAt).toLocaleString()}
                    </td>
                    <td style={td}>
                      <Badge tone={h.overallStatus === 'healthy' ? 'green' : h.overallStatus === 'degraded' ? 'amber' : 'red'}>
                        {h.overallStatus}
                      </Badge>
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{h.statusCode ?? '—'}</td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{h.responseTimeMs != null ? `${h.responseTimeMs}ms` : '—'}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{h.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>

        {/* Version history */}
        <Card header={<span>Version history — {versionHistory.data?.length ?? 0} versions</span>}>
          {versionMsg && (
            <p style={{ fontSize: 11, color: versionMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)', margin: '0 0 8px', padding: '0 0 8px', borderBottom: '1px solid var(--border)' }}>{versionMsg}</p>
          )}
          {(!versionHistory.data || versionHistory.data.length === 0) ? (
            <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text3)' }}>No versions recorded yet.</div>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th style={{ ...th, width: '8%' }}>Ver.</th>
                  <th style={{ ...th, width: '24%' }}>Changed</th>
                  <th style={{ ...th, width: '16%' }}>By</th>
                  <th style={{ ...th }}>Reason</th>
                  <th style={{ ...th, width: '14%' }}></th>
                </tr>
              </thead>
              <tbody>
                {versionHistory.data.map((v, i) => (
                  <tr key={v.id}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>v{v.versionNumber}</td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>
                      {new Date(v.changedAt).toLocaleString()}
                    </td>
                    <td style={{ ...td, fontSize: 11 }}>{v.changedBy}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text2)' }}>{v.changeReason ?? '—'}</td>
                    <td style={td}>
                      {i !== 0 && (
                        <Button
                          variant="ghost"
                          style={{ fontSize: 11, color: 'var(--amber)', padding: '2px 8px' }}
                          disabled={rollbackMut.isPending}
                          onClick={() => {
                            if (confirm(`Roll back to v${v.versionNumber}?`)) {
                              rollbackMut.mutate({ versionId: v.id }, {
                                onSuccess: () => setVersionMsg(`Rolled back to v${v.versionNumber}`),
                                onError: (e) => setVersionMsg(`Error: ${e.message}`),
                              })
                            }
                          }}
                        >
                          Rollback
                        </Button>
                      )}
                      {i === 0 && <span style={{ fontSize: 10, color: 'var(--text3)' }}>current</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>

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

        {/* §9.4 A/B traffic split */}
        <Card header={<span>A/B traffic split</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {abUpstreams.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>No upstreams configured. Add upstreams in the main settings.</div>}
            {abUpstreams.map((u, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px', gap: 8, alignItems: 'center' }}>
                <Input value={u.label} onChange={e => setAbUpstreams(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="label" style={{ fontSize: 12 }} />
                <Input value={u.address} onChange={e => setAbUpstreams(prev => prev.map((x, j) => j === i ? { ...x, address: e.target.value } : x))} placeholder="host:port" style={{ fontSize: 12 }} />
                <Input type="number" min={0} max={100} value={u.weight} onChange={e => setAbUpstreams(prev => prev.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} placeholder="weight" style={{ fontSize: 12 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" style={{ fontSize: 11 }} onClick={() => setAbUpstreams(prev => [...prev, { address: '', weight: 50, label: `upstream-${prev.length + 1}` }])}>+ Add upstream</Button>
              <Button variant="primary" style={{ fontSize: 11 }} disabled={setTrafficSplitMut.isPending} onClick={() => setTrafficSplitMut.mutate({ routeId: id, upstreams: abUpstreams })}>Save split</Button>
            </div>
            {abMsg && <div style={{ fontSize: 11, color: abMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{abMsg}</div>}
          </div>
        </Card>

        {/* §9.5 Smart routing rules */}
        <Card header={<span>Smart routing rules</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {routeRulesQuery.data && routeRulesQuery.data.length > 0 && (
              <DataTable>
                <thead>
                  <tr>
                    <th style={th}>Priority</th>
                    <th style={th}>Match</th>
                    <th style={th}>Value</th>
                    <th style={th}>Action</th>
                    <th style={th}>Target</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {routeRulesQuery.data.map(rule => (
                    <tr key={rule.id}>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{rule.priority}</td>
                      <td style={{ ...td, fontSize: 11 }}>{rule.matcherType}{rule.matcherKey ? `:${rule.matcherKey}` : ''}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{rule.matcherValue}</td>
                      <td style={td}><Badge tone="neutral">{rule.action}</Badge></td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{rule.upstream ?? rule.redirectUrl ?? rule.staticBody?.slice(0, 30) ?? '—'}</td>
                      <td style={td}>
                        <button onClick={() => updateRuleMut.mutate({ id: rule.id, enabled: !rule.enabled })} style={{ fontSize: 10, color: rule.enabled ? 'var(--green)' : 'var(--text3)', cursor: 'pointer', background: 'none', border: 'none' }}>{rule.enabled ? 'on' : 'off'}</button>
                        {' '}
                        <button onClick={() => { if (confirm('Delete rule?')) deleteRuleMut.mutate({ id: rule.id }) }} style={{ fontSize: 10, color: 'var(--red)', cursor: 'pointer', background: 'none', border: 'none' }}>del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 60px', gap: 8 }}>
              <Select value={ruleMatcherType} onChange={e => setRuleMatcherType(e.target.value as typeof ruleMatcherType)} style={{ fontSize: 12 }}>
                <option value="path">path</option>
                <option value="header">header</option>
                <option value="query">query</option>
                <option value="method">method</option>
              </Select>
              <Input value={ruleMatcherKey} onChange={e => setRuleMatcherKey(e.target.value)} placeholder="key (header/query)" style={{ fontSize: 12 }} />
              <Input value={ruleMatcherValue} onChange={e => setRuleMatcherValue(e.target.value)} placeholder="value / path" style={{ fontSize: 12 }} />
              <Select value={ruleAction} onChange={e => setRuleAction(e.target.value as typeof ruleAction)} style={{ fontSize: 12 }}>
                <option value="upstream">upstream</option>
                <option value="redirect">redirect</option>
                <option value="static">static</option>
              </Select>
              <Input type="number" value={rulePriority} onChange={e => setRulePriority(Number(e.target.value))} placeholder="pri" style={{ fontSize: 12 }} />
            </div>
            <Input value={ruleTarget} onChange={e => setRuleTarget(e.target.value)} placeholder="target — upstream host:port, redirect URL, or static body" style={{ fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" style={{ fontSize: 11 }} disabled={!ruleMatcherValue || !ruleTarget || createRuleMut.isPending}
                onClick={() => {
                  const base = { routeId: id, matcherType: ruleMatcherType, matcherValue: ruleMatcherValue, action: ruleAction, priority: rulePriority }
                  const extra = ruleAction === 'upstream' ? { upstream: ruleTarget } : ruleAction === 'redirect' ? { redirectUrl: ruleTarget } : { staticBody: ruleTarget, staticStatus: 200 }
                  createRuleMut.mutate({ ...base, ...(ruleMatcherKey ? { matcherKey: ruleMatcherKey } : {}), ...extra })
                }}>Add rule</Button>
            </div>
            {rulesMsg && <div style={{ fontSize: 11, color: rulesMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{rulesMsg}</div>}
          </div>
        </Card>

        {/* §9.6 Request/response transforms */}
        <Card header={<span>Request &amp; response transforms</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Path rewrite</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Strip prefix</div>
                  <Input value={pathStrip} onChange={e => setPathStrip(e.target.value)} placeholder="/api/v1" style={{ fontSize: 12 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Add prefix</div>
                  <Input value={pathAdd} onChange={e => setPathAdd(e.target.value)} placeholder="/v2" style={{ fontSize: 12 }} />
                </div>
              </div>
              <Button variant="primary" style={{ fontSize: 11 }} disabled={updateRoute.isPending}
                onClick={() => updateRoute.mutate({ id, patch: { pathRewrite: (pathStrip || pathAdd) ? JSON.stringify({ strip: pathStrip || undefined, add: pathAdd || undefined }) : null } as Parameters<typeof updateRoute.mutate>[0]['patch'] },
                  { onSuccess: () => setTransformMsg('Saved'), onError: e => setTransformMsg(`Error: ${e.message}`) })}>Save path rewrite</Button>
              {transformMsg && <span style={{ marginLeft: 8, fontSize: 11, color: transformMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{transformMsg}</span>}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>CORS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, marginBottom: 8 }}>
                <Select value={corsPreset} onChange={e => setCorsPreset(e.target.value as typeof corsPreset)} style={{ fontSize: 12 }}>
                  <option value="permissive">Permissive (*)</option>
                  <option value="restrictive">Restrictive</option>
                  <option value="custom">Custom</option>
                </Select>
                {corsPreset === 'custom' && (
                  <Input value={corsOrigins} onChange={e => setCorsOrigins(e.target.value)} placeholder="https://app.example.com, https://other.com" style={{ fontSize: 12 }} />
                )}
              </div>
              <Button variant="primary" style={{ fontSize: 11 }} disabled={updateRoute.isPending}
                onClick={() => updateRoute.mutate({ id, patch: { corsConfig: JSON.stringify({ preset: corsPreset, allowOrigins: corsPreset === 'custom' ? corsOrigins.split(',').map(s => s.trim()).filter(Boolean) : undefined }) } as Parameters<typeof updateRoute.mutate>[0]['patch'] },
                  { onSuccess: () => setCorsMsg('Saved'), onError: e => setCorsMsg(`Error: ${e.message}`) })}>Save CORS</Button>
              {corsMsg && <span style={{ marginLeft: 8, fontSize: 11, color: corsMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{corsMsg}</span>}
            </div>
          </div>
        </Card>

        {/* §9.8 Slow request log */}
        <Card header={<span>Slow requests (&gt;1s)</span>}>
          <DataTable>
            <thead>
              <tr>
                <th style={{ ...th, width: '16%' }}>Time</th>
                <th style={{ ...th, width: '8%' }}>Method</th>
                <th style={{ ...th, width: '34%' }}>Path</th>
                <th style={{ ...th, width: '10%' }}>Status</th>
                <th style={{ ...th, width: '12%' }}>Latency</th>
                <th style={{ ...th, width: '20%' }}>Client</th>
              </tr>
            </thead>
            <tbody>
              {(!slowReqs.data || slowReqs.data.length === 0) && (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text3)', padding: '24px 12px' }}>No slow requests recorded.</td></tr>
              )}
              {slowReqs.data?.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{new Date(r.recordedAt).toLocaleTimeString()}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{r.method}</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--pu-400)', fontSize: 11 }}>{r.path}</td>
                  <td style={td}><Badge tone={statusTone(r.statusCode ?? 0)}>{r.statusCode}</Badge></td>
                  <td style={{ ...td, color: 'var(--amber)', fontWeight: 600 }}>{r.latencyMs}ms</td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{r.clientIp}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        {/* SSL / Security headers */}
        <Card header={<span>SSL &amp; Security Headers</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
            {[
              { label: 'Force SSL', desc: 'Redirect all HTTP traffic to HTTPS for this route', value: forceSSL, set: setForceSSL, field: 'forceSSL' as const },
              { label: 'HSTS Enabled', desc: 'Add Strict-Transport-Security header (max-age 63072000)', value: hstsEnabled, set: setHstsEnabled, field: 'hstsEnabled' as const },
              { label: 'HSTS Subdomains', desc: 'Include "includeSubDomains" in the HSTS header', value: hstsSubdomains, set: setHstsSubdomains, field: 'hstsSubdomains' as const },
              { label: 'HTTP/2 Support', desc: 'Enable HTTP/2 for upstream connections', value: http2Enabled, set: setHttp2Enabled, field: 'http2Enabled' as const },
              { label: 'Trust Upstream Forwarded Headers', desc: 'Set X-Forwarded-For, X-Forwarded-Proto, X-Real-IP on proxied requests', value: trustUpstreamHeaders, set: setTrustUpstreamHeaders, field: 'trustUpstreamHeaders' as const },
            ].map(({ label, desc, value, set, field }) => (
              <div key={field} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{desc}</div>
                </div>
                <button
                  onClick={() => {
                    const next = !value
                    set(next)
                    setSslMsg('')
                    updateRoute.mutate(
                      { id, patch: { [field]: next } },
                      { onSuccess: () => setSslMsg('Saved'), onError: e => setSslMsg(`Error: ${e.message}`) }
                    )
                  }}
                  style={{
                    flexShrink: 0,
                    width: 42,
                    height: 24,
                    borderRadius: 12,
                    border: 'none',
                    background: value ? 'var(--accent)' : 'var(--border)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: 3,
                    left: value ? 21 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.15s',
                  }} />
                </button>
              </div>
            ))}
            {sslMsg && <div style={{ fontSize: 12, fontFamily: 'var(--font-sans)', color: sslMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{sslMsg}</div>}
          </div>
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
