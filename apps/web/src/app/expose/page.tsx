'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertBanner, Badge, Button, Card, Checkbox, Dot, Input, Select, StepIndicator, Toggle } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

type TlsMode = 'auto' | 'dns' | 'internal' | 'custom' | 'off'
type SourceMode = 'manual' | 'infraos' | 'scanner'
type RoutingMode = 'direct' | 'cloudflare_tunnel' | 'tailscale'

const STEPS = ['Source', 'Domain', 'Routing', 'Access', 'Options', 'Monitoring', 'Review']

export default function ExposePage() {
  const utils = trpc.useUtils()
  const status = trpc.system.caddyStatus.useQuery(undefined, { refetchInterval: 5000 })
  const ssoProviders = trpc.sso.list.useQuery()
  const dnsProviders = trpc.dns.list.useQuery()
  const connectionList = trpc.connections.list.useQuery()
  const autoConfigSso = trpc.chain.autoConfigSso.useMutation()
  const createMonitor = trpc.monitors.createForRoute.useMutation()

  const expose = trpc.routes.expose.useMutation({
    onSuccess: async (r) => {
      utils.routes.list.invalidate()
      if (autoConfigConnectionId && r.routeId) {
        await autoConfigSso.mutateAsync({ routeId: r.routeId, connectionId: autoConfigConnectionId }).catch(() => null)
      }
      if (autoCreateMonitor && monitoringConnectionId && r.routeId) {
        await createMonitor.mutateAsync({ routeId: r.routeId, connectionId: monitoringConnectionId }).catch(() => null)
      }
      setResult(r)
      setError(null)
    },
    onError: (e) => { setError(e.message); setResult(null) },
  })

  const cfConnections = connectionList.data?.filter(c => c.type === 'cloudflare') ?? []
  const identityConnections = connectionList.data?.filter(c =>
    ['authentik', 'authelia', 'keycloak', 'zitadel'].includes(c.type)
  ) ?? []
  const monitoringConnections = connectionList.data?.filter(c =>
    ['uptime_kuma', 'betterstack', 'freshping'].includes(c.type)
  ) ?? []
  const notifConnections = connectionList.data?.filter(c =>
    ['zulip', 'slack', 'webhook'].includes(c.type)
  ) ?? []

  // Source
  const [step, setStep] = useState(0)
  const [sourceMode, setSourceMode] = useState<SourceMode>('manual')
  const [ip, setIp] = useState('')
  const [port, setPort] = useState('')
  const [protocol, setProtocol] = useState<'http' | 'https'>('http')
  const [name, setName] = useState('')

  // Domain
  const [domain, setDomain] = useState('')
  const [tlsMode, setTlsMode] = useState<TlsMode>('auto')
  const [tlsDnsProviderId, setTlsDnsProviderId] = useState('')
  const [autoDns, setAutoDns] = useState(true)
  const [cfConnectionId, setCfConnectionId] = useState('')

  // Routing
  const [routingMode, setRoutingMode] = useState<RoutingMode>('direct')
  const [tunnelId, setTunnelId] = useState('')

  // Access
  const [ssoEnabled, setSsoEnabled] = useState(false)
  const [ssoProviderId, setSsoProviderId] = useState('')
  const [autoConfigConnectionId, setAutoConfigConnectionId] = useState('')
  const [ipAllowlist, setIpAllowlist] = useState('')
  const [basicAuth, setBasicAuth] = useState(false)
  const [basicUser, setBasicUser] = useState('')
  const [basicPass, setBasicPass] = useState('')
  const [cfBotFight, setCfBotFight] = useState(false)
  const [cfGeoBlock, setCfGeoBlock] = useState('')
  const [cfEdgeRpm, setCfEdgeRpm] = useState('')
  const [jwtValidation, setJwtValidation] = useState(false)
  const [jwksUrl, setJwksUrl] = useState('')

  // Options
  const [rateLimit, setRateLimit] = useState(false)
  const [rpm, setRpm] = useState('100')
  const [compression, setCompression] = useState(true)
  const [ws, setWs] = useState(true)
  const [http3, setHttp3] = useState(true)
  const [healthCheck, setHealthCheck] = useState(true)
  const [healthPath, setHealthPath] = useState('/')

  // Monitoring
  const [autoCreateMonitor, setAutoCreateMonitor] = useState(true)
  const [monitoringConnectionId, setMonitoringConnectionId] = useState('')
  const [monitorInterval, setMonitorInterval] = useState('60s')

  // Custom config
  const [customJson, setCustomJson] = useState('')
  const [customJsonError, setCustomJsonError] = useState('')

  // Review
  const [jsonOpen, setJsonOpen] = useState(false)

  const [result, setResult] = useState<Awaited<ReturnType<typeof expose.mutateAsync>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upstreamUrl = useMemo(() => {
    if (!ip || !port) return ''
    return `${protocol}://${ip}:${port}`
  }, [ip, port, protocol])

  const caddyReady = status.data?.reachable && status.data.hasMain
  const ssoProvider = ssoProviders.data?.find((p) => p.id === ssoProviderId)
  const cfConn = cfConnections.find(c => c.id === cfConnectionId) ?? cfConnections[0]

  function canAdvance() {
    if (step === 0) return ip.length > 0 && port.length > 0 && name.length > 0
    if (step === 1) return domain.length > 0 && (tlsMode !== 'dns' || tlsDnsProviderId !== '') && !(domain.startsWith('*.') && tlsMode === 'auto')
    if (step === 3) return !ssoEnabled || ssoProviderId !== ''
    return true
  }

  function onSubmit() {
    expose.mutate({
      name, upstreamUrl, domain, tlsMode,
      tlsDnsProviderId: tlsMode === 'dns' ? tlsDnsProviderId || null : null,
      ssoEnabled,
      ssoProviderId: ssoEnabled ? ssoProviderId || null : null,
    })
  }

  const chainActions = useMemo(() => {
    const actions: { system: string; action: string }[] = []
    actions.push({ system: 'Caddy', action: `Create route for ${domain || 'domain'} → ${ip}:${port}` })
    if (tlsMode !== 'off') actions.push({ system: 'TLS', action: `Provision ${tlsMode === 'auto' ? "Let's Encrypt (HTTP-01)" : tlsMode === 'dns' ? "Let's Encrypt (DNS-01)" : tlsMode === 'internal' ? 'Caddy internal CA' : 'custom cert'}` })
    if (autoDns && cfConn) actions.push({ system: 'Cloudflare DNS', action: `Create ${routingMode === 'cloudflare_tunnel' ? 'CNAME' : 'A'} record for ${domain || 'domain'}` })
    if (routingMode === 'cloudflare_tunnel' && tunnelId) actions.push({ system: 'CF Tunnel', action: `Add ingress rule for ${domain || 'domain'} to tunnel ${tunnelId}` })
    if (ssoEnabled && autoConfigConnectionId) {
      const conn = identityConnections.find(c => c.id === autoConfigConnectionId)
      if (conn) actions.push({ system: conn.type, action: `Create proxy provider + application "${name || 'service'}"` })
    }
    if (autoCreateMonitor && monitoringConnectionId) {
      const conn = monitoringConnections.find(c => c.id === monitoringConnectionId)
      if (conn) actions.push({ system: conn.name, action: `Create HTTP monitor for https://${domain || 'domain'} (${monitorInterval})` })
    }
    return actions
  }, [domain, ip, port, tlsMode, autoDns, cfConn, routingMode, tunnelId, ssoEnabled, autoConfigConnectionId, identityConnections, autoCreateMonitor, monitoringConnectionId, monitoringConnections, monitorInterval, name])

  const caddyPreview = useMemo(() => {
    let customHandlers: unknown[] = []
    if (customJson.trim()) {
      try { customHandlers = JSON.parse(customJson) as unknown[] } catch { /* invalid */ }
    }
    return JSON.stringify({
      match: [{ host: [domain] }],
      handle: [
        ssoEnabled && ssoProvider ? { handler: 'forward_auth', uri: ssoProvider.forwardAuthUrl, copy_headers: ssoProvider.authResponseHeaders } : undefined,
        rateLimit ? { handler: 'rate_limit', zone: { key: '{remote_host}', events: Number(rpm), window: '1m' } } : undefined,
        compression ? { handler: 'encode', encodings: { gzip: {}, zstd: {} } } : undefined,
        ...customHandlers,
        {
          handler: 'reverse_proxy',
          upstreams: [{ dial: `${ip}:${port}` }],
          health_checks: healthCheck ? { active: { path: healthPath, interval: '30s', timeout: '5s' } } : undefined,
        },
      ].filter(Boolean),
      terminal: true,
    }, null, 2)
  }, [domain, ssoEnabled, ssoProvider, rateLimit, rpm, compression, ip, port, healthCheck, healthPath, customJson])

  if (result) {
    return (
      <>
        <Topbar title="Expose service" />
        <PageContent>
          <Card header={<><span>Success</span><Badge tone="green">live</Badge></>}>
            <div style={{ padding: '2px 0' }}>
              <div style={{ color: 'var(--green)', fontSize: 13, fontWeight: 500 }}>✓ Route live in Caddy</div>
              <div style={{ marginTop: 10 }}>
                <a href={result.url} target="_blank" rel="noreferrer" style={{ color: 'var(--pu-400)', fontSize: 15 }}>{result.url}</a>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                cert · {result.certStatus} · sso · {result.ssoEnabled ? 'on' : 'off'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <Link href={`/routes/${result.routeId}`}><Button variant="primary">View chain</Button></Link>
                <Link href="/routes"><Button>All routes</Button></Link>
                <Link href="/"><Button>Dashboard</Button></Link>
              </div>
            </div>
          </Card>
        </PageContent>
      </>
    )
  }

  return (
    <>
      <Topbar
        title="Expose service"
        actions={
          <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Dot tone={caddyReady ? 'green' : 'red'} />
            <span style={{ color: 'var(--text-dim)' }}>
              Caddy · {!status.data ? 'checking' : !status.data.reachable ? 'unreachable' : !status.data.hasMain ? 'no server' : 'ready'}
            </span>
          </span>
        }
        banner={!caddyReady && status.data ? <AlertBanner tone="amber">Caddy admin API is not reachable — you can prepare the config but pushing will fail.</AlertBanner> : null}
      />
      <PageContent>
        <StepIndicator steps={STEPS} active={step} />

        {/* Step 0: Source */}
        {step === 0 && (
          <Card header={<span>Source</span>}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['manual', 'infraos', 'scanner'] as SourceMode[]).map((m) => (
                <Button key={m} variant={sourceMode === m ? 'primary' : 'ghost'} onClick={() => setSourceMode(m)}>
                  {m === 'manual' ? 'Manual' : m === 'infraos' ? 'From Infra OS' : 'From Scanner'}
                </Button>
              ))}
            </div>
            {sourceMode === 'manual' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <Field label="Service name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="grafana" /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 140px', gap: 8 }}>
                  <Field label="Protocol">
                    <Select value={protocol} onChange={(e) => setProtocol(e.target.value as 'http' | 'https')}>
                      <option value="http">http</option>
                      <option value="https">https</option>
                    </Select>
                  </Field>
                  <Field label="IP address"><Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.10" /></Field>
                  <Field label="Port"><Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="3000" /></Field>
                </div>
                {upstreamUrl && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    Upstream: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--pu-400)' }}>{upstreamUrl}</code>
                  </div>
                )}
              </div>
            )}
            {sourceMode !== 'manual' && (
              <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '20px 0' }}>Use Manual for now.</div>
            )}
          </Card>
        )}

        {/* Step 1: Domain + DNS */}
        {step === 1 && (
          <Card header={<span>Domain + DNS</span>}>
            <Field label="Public domain"><Input value={domain} onChange={(e) => {
              const val = e.target.value
              setDomain(val)
              if (val.startsWith('*.') && tlsMode === 'auto') {
                setTlsMode((dnsProviders.data?.length ?? 0) > 0 ? 'dns' : 'internal')
                if ((dnsProviders.data?.length ?? 0) > 0 && dnsProviders.data?.[0]) {
                  setTlsDnsProviderId(dnsProviders.data[0].id)
                }
              }
            }} placeholder="grafana.example.com or *.example.com" /></Field>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6, marginBottom: 6 }}>TLS mode</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {(['auto', 'dns', 'internal', 'custom', 'off'] as TlsMode[]).map((m) => (
                <button key={m} onClick={() => setTlsMode(m)} style={{
                  padding: '10px 8px', background: tlsMode === m ? 'rgba(124,111,240,0.15)' : 'transparent',
                  color: tlsMode === m ? 'var(--text-primary)' : 'var(--text-dim)',
                  border: tlsMode === m ? '1px solid var(--pu-400)' : '0.5px solid var(--border)',
                  borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', textAlign: 'left',
                }}>
                  <div style={{ fontWeight: 500 }}>{m}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{tlsDesc(m)}</div>
                </button>
              ))}
            </div>
            {tlsMode === 'dns' && (
              <div style={{ marginTop: 10 }}>
                <Field label="DNS provider">
                  <Select value={tlsDnsProviderId} onChange={(e) => setTlsDnsProviderId(e.target.value)} required>
                    <option value="">pick…</option>
                    {dnsProviders.data?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                  </Select>
                </Field>
              </div>
            )}
            {tlsMode === 'off' && <div style={{ marginTop: 10 }}><AlertBanner tone="red">TLS is disabled. Traffic will be unencrypted.</AlertBanner></div>}
            {domain.startsWith('*.') && tlsMode === 'auto' && (
              <div style={{ marginTop: 10 }}>
                <AlertBanner tone="amber">Wildcard domains cannot use HTTP-01. Select <strong>dns</strong> or <strong>internal</strong>.</AlertBanner>
              </div>
            )}
            {domain.startsWith('*.') && (tlsMode === 'dns' || tlsMode === 'internal') && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-sans)' }}>
                Wildcard — {tlsMode === 'dns' ? 'DNS-01 challenge' : 'Caddy internal CA'} will be used.
              </div>
            )}

            {cfConnections.length > 0 && (
              <div style={{ marginTop: 16, padding: '12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <ToggleRow label="Auto-create DNS record" checked={autoDns} onChange={setAutoDns} />
                {autoDns && (
                  <div style={{ paddingLeft: 20, marginTop: 6 }}>
                    <Field label="Cloudflare connection">
                      <Select value={cfConnectionId} onChange={e => setCfConnectionId(e.target.value)}>
                        {cfConnections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Field>
                    {domain && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        Preview: {domain} → {routingMode === 'cloudflare_tunnel' ? 'CNAME → tunnel' : `A → ${ip || 'your-ip'}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Step 2: Routing path */}
        {step === 2 && (
          <Card header={<span>Routing path</span>}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              How will traffic reach your upstream? Select a routing path.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {([
                { id: 'direct', label: 'Direct', desc: 'Caddy serves publicly' },
                { id: 'cloudflare_tunnel', label: 'CF Tunnel', desc: 'Via Cloudflare tunnel' },
                { id: 'tailscale', label: 'Tailscale', desc: 'Via Tailscale Funnel' },
              ] as { id: RoutingMode; label: string; desc: string }[]).map((m) => (
                <button key={m.id} onClick={() => setRoutingMode(m.id)} style={{
                  padding: '12px 10px', background: routingMode === m.id ? 'rgba(124,111,240,0.15)' : 'var(--surface-2)',
                  border: routingMode === m.id ? '1px solid var(--pu-400)' : '0.5px solid var(--border)',
                  borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', textAlign: 'left',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{m.desc}</div>
                </button>
              ))}
            </div>
            {routingMode === 'cloudflare_tunnel' && (
              <div style={{ paddingLeft: 4 }}>
                <Field label="Tunnel ID" hint="Find this in your Cloudflare Zero Trust dashboard.">
                  <Input value={tunnelId} onChange={e => setTunnelId(e.target.value)} placeholder="abc123-..." />
                </Field>
                {cfConnections.length === 0 && (
                  <AlertBanner tone="amber">No Cloudflare connection active. Add one in Connections first.</AlertBanner>
                )}
              </div>
            )}
            {routingMode === 'tailscale' && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '8px 0' }}>
                Tailscale Funnel will expose this route via your Tailscale node. Ensure the Tailscale daemon is running on the ProxyOS host.
              </div>
            )}
            {routingMode === 'direct' && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '8px 0' }}>
                Caddy will serve this route directly. Your server IP must be reachable from the internet.
              </div>
            )}
          </Card>
        )}

        {/* Step 3: Access */}
        {step === 3 && (
          <Card header={<span>Access</span>}>
            <ToggleRow label="Require SSO" checked={ssoEnabled} onChange={setSsoEnabled} />
            {ssoEnabled && (
              <div style={{ marginTop: 8, paddingLeft: 20, borderLeft: '2px solid var(--border)' }}>
                <Field label="Provider">
                  <Select value={ssoProviderId} onChange={(e) => setSsoProviderId(e.target.value)} required>
                    <option value="">pick…</option>
                    {ssoProviders.data?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                  </Select>
                </Field>
                {ssoProvider && (
                  <>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Forward auth URL</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, wordBreak: 'break-all' }}>{ssoProvider.forwardAuthUrl}</div>
                  </>
                )}
                {identityConnections.length > 0 && (
                  <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 4 }}>Auto-configure identity provider</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                      ProxyOS will create the application entry automatically when this route is exposed.
                    </div>
                    <select value={autoConfigConnectionId} onChange={e => setAutoConfigConnectionId(e.target.value)}
                      style={{ fontSize: 11, padding: '4px 8px', background: 'var(--surface-1)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, width: '100%' }}>
                      <option value="">— skip —</option>
                      {identityConnections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 16 }} />
            <Field label="IP allowlist (CIDR, comma separated)" hint="Leave empty for public.">
              <Input value={ipAllowlist} onChange={(e) => setIpAllowlist(e.target.value)} placeholder="10.0.0.0/8, 192.168.0.0/16" />
            </Field>
            <ToggleRow label="Basic auth" checked={basicAuth} onChange={setBasicAuth} />
            {basicAuth && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingLeft: 20 }}>
                <Field label="Username"><Input value={basicUser} onChange={(e) => setBasicUser(e.target.value)} /></Field>
                <Field label="Password"><Input type="password" value={basicPass} onChange={(e) => setBasicPass(e.target.value)} /></Field>
              </div>
            )}

            {cfConnections.length > 0 && (
              <div style={{ marginTop: 16, padding: '12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>Cloudflare security</div>
                <ToggleRow label="Bot fight mode" checked={cfBotFight} onChange={setCfBotFight} />
                <Field label="GeoIP block (country codes, comma separated)" hint="e.g. CN, RU, KP">
                  <Input value={cfGeoBlock} onChange={e => setCfGeoBlock(e.target.value)} placeholder="CN, RU" />
                </Field>
                <Field label="Edge rate limit (req/min, 0 = off)">
                  <Input type="number" value={cfEdgeRpm} onChange={e => setCfEdgeRpm(e.target.value)} placeholder="0" />
                </Field>
              </div>
            )}

            <div style={{ marginTop: 12, padding: '12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>Proxy-layer security</div>
              <ToggleRow label="JWT validation" checked={jwtValidation} onChange={setJwtValidation} />
              {jwtValidation && (
                <div style={{ paddingLeft: 20 }}>
                  <Field label="JWKS URL"><Input value={jwksUrl} onChange={e => setJwksUrl(e.target.value)} placeholder="https://auth.example.com/.well-known/jwks.json" /></Field>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Step 4: Options */}
        {step === 4 && (
          <Card header={<span>Options</span>}>
            <ToggleRow label="Rate limiting" checked={rateLimit} onChange={setRateLimit} />
            {rateLimit && (
              <div style={{ paddingLeft: 20 }}>
                <Field label="Requests per minute"><Input type="number" value={rpm} onChange={(e) => setRpm(e.target.value)} /></Field>
              </div>
            )}
            <ToggleRow label="Compression" checked={compression} onChange={setCompression} />
            <ToggleRow label="WebSocket support" checked={ws} onChange={setWs} />
            <ToggleRow label="HTTP/3 (QUIC)" checked={http3} onChange={setHttp3} />
            <ToggleRow label="Upstream health check" checked={healthCheck} onChange={setHealthCheck} />
            {healthCheck && (
              <div style={{ paddingLeft: 20 }}>
                <Field label="Health check path"><Input value={healthPath} onChange={(e) => setHealthPath(e.target.value)} /></Field>
              </div>
            )}

            <div style={{ marginTop: 16, borderTop: '0.5px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 4 }}>Custom Caddy config</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.5 }}>
                Paste a JSON array of Caddy handlers to inject before the reverse proxy. These are applied as-is — use Caddy&apos;s handler format.
              </div>
              <textarea
                value={customJson}
                onChange={(e) => {
                  setCustomJson(e.target.value)
                  if (!e.target.value.trim()) { setCustomJsonError(''); return }
                  try { const v = JSON.parse(e.target.value); if (!Array.isArray(v)) throw new Error('Must be a JSON array'); setCustomJsonError('') }
                  catch (err) { setCustomJsonError((err as Error).message) }
                }}
                placeholder={`[\n  { "handler": "headers", "response": { "set": { "X-Frame-Options": ["DENY"] } } }\n]`}
                style={{
                  width: '100%', minHeight: 120, fontFamily: 'var(--font-mono)', fontSize: 11,
                  background: 'var(--surface-2)', color: 'var(--text-primary)',
                  border: customJsonError ? '1px solid var(--red)' : '1px solid var(--border)',
                  borderRadius: 6, padding: '8px 10px', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
              {customJsonError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{customJsonError}</div>}
            </div>
          </Card>
        )}

        {/* Step 5: Monitoring */}
        {step === 5 && (
          <Card header={<span>Monitoring</span>}>
            {monitoringConnections.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '12px 0' }}>
                No monitoring connections. Add one via <strong>Connections</strong>.
              </div>
            ) : (
              <>
                <ToggleRow label="Auto-create uptime monitor" checked={autoCreateMonitor} onChange={setAutoCreateMonitor} />
                {autoCreateMonitor && (
                  <div style={{ paddingLeft: 20, marginTop: 4 }}>
                    <Field label="Monitoring service">
                      <select value={monitoringConnectionId} onChange={e => setMonitoringConnectionId(e.target.value)}
                        style={{ fontSize: 12, padding: '6px 8px', background: 'var(--surface-1)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, width: '100%' }}>
                        <option value="">— pick —</option>
                        {monitoringConnections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                      </select>
                    </Field>
                    <Field label="Check interval">
                      <Select value={monitorInterval} onChange={e => setMonitorInterval(e.target.value)}>
                        <option value="30s">30 seconds</option>
                        <option value="60s">1 minute</option>
                        <option value="5m">5 minutes</option>
                      </Select>
                    </Field>
                  </div>
                )}
              </>
            )}

            {notifConnections.length > 0 && (
              <div style={{ marginTop: 16, padding: '12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>Alert channels</div>
                {notifConnections.map(c => (
                  <div key={c.id} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0' }}>
                    <Badge tone="green">✓</Badge> {c.name} ({c.type})
                  </div>
                ))}
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>All connected notification channels will receive alerts for this route.</div>
              </div>
            )}
          </Card>
        )}

        {/* Step 6: Review — full chain action preview */}
        {step === 6 && (
          <Card header={<span>Review</span>}>
            {/* Service name header */}
            <div style={{ textAlign: 'center', padding: '8px 0 16px', borderBottom: '0.5px solid var(--border)', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{name || 'Unnamed service'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{upstreamUrl || '—'}</div>
            </div>

            {chainActions.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>ProxyOS will:</div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 6, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
                  {chainActions.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 12px', borderBottom: i < chainActions.length - 1 ? '0.5px solid var(--border)' : undefined }}>
                      <span style={{ fontSize: 10, color: 'var(--pu-400)', fontFamily: 'var(--font-mono)', minWidth: 120 }}>{a.system}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
              <div>
                <ReviewItem k="Source" v={upstreamUrl} mono />
                <ReviewItem k="Domain" v={<><strong>{domain}</strong> · <Badge tone={tlsMode === 'off' ? 'red' : 'green'}>{tlsMode}</Badge></>} />
                <ReviewItem k="Routing" v={<Badge tone="neutral">{routingMode.replace('_', ' ')}</Badge>} />
                <ReviewItem k="SSO" v={ssoEnabled ? <><Badge tone="purple">{ssoProvider?.type}</Badge> <span style={{ color: 'var(--text-secondary)' }}>{ssoProvider?.name}</span></> : <span style={{ color: 'var(--text-dim)' }}>disabled</span>} />
              </div>
              <div>
                <ReviewItem k="Rate limit" v={rateLimit ? `${rpm} rpm` : 'off'} />
                <ReviewItem k="Options" v={[compression && 'gzip', ws && 'ws', http3 && 'http3', healthCheck && 'health'].filter(Boolean).join(' · ')} />
                <ReviewItem k="IP allowlist" v={ipAllowlist || <span style={{ color: 'var(--text-dim)' }}>public</span>} />
                <ReviewItem k="Monitor" v={autoCreateMonitor && monitoringConnectionId ? <Badge tone="green">{monitorInterval}</Badge> : <span style={{ color: 'var(--text-dim)' }}>off</span>} />
              </div>
            </div>

            <div style={{ marginTop: 4 }}>
              <button onClick={() => setJsonOpen(v => !v)}
                style={{ background: 'none', border: 0, color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                {jsonOpen ? '▾' : '▸'} Caddy config preview
              </button>
              {jsonOpen && (
                <pre style={{ background: 'var(--night-100)', border: '0.5px solid var(--border)', borderRadius: 6, padding: 10, fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 6, overflowX: 'auto', color: 'var(--text-secondary)' }}>
{caddyPreview}
                </pre>
              )}
            </div>

            {error && <div style={{ marginTop: 10 }}><AlertBanner tone="red">{error}</AlertBanner></div>}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <Button variant="primary" onClick={onSubmit}
                disabled={expose.isPending || !caddyReady || !!customJsonError}
                style={{ minWidth: 160, padding: '8px 24px', fontSize: 13 }}>
                {expose.isPending ? 'Exposing…' : `Expose ${name || 'service'}`}
              </Button>
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <Button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>← Back</Button>
          {step < STEPS.length - 1 && (
            <Button variant="primary" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}>Next →</Button>
          )}
        </div>
      </PageContent>
    </>
  )
}

function tlsDesc(m: TlsMode): string {
  switch (m) {
    case 'auto': return "Let's Encrypt"
    case 'dns': return 'DNS-01 (wildcard)'
    case 'internal': return 'Caddy CA'
    case 'custom': return 'Upload cert'
    case 'off': return 'HTTP only'
  }
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>{hint}</span>}
    </label>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function ReviewItem({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', marginTop: 2 }}>{v}</div>
    </div>
  )
}

void Checkbox
