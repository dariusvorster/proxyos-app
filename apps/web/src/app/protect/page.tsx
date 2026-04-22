'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar, PageContent, PageHeader } from '~/components/shell'
import { Badge, Button, Card } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { useErrorHandler } from '@/hooks/useErrorHandler'

type Step = 'route' | 'auth' | 'access' | 'waf' | 'review'

const STEPS: Step[] = ['route', 'auth', 'access', 'waf', 'review']

const STEP_LABELS: Record<Step, string> = {
  route: '1. Select route',
  auth: '2. Authentication',
  access: '3. Access control',
  waf: '4. WAF',
  review: '5. Review & apply',
}

interface Config {
  routeId: string
  enableSSO: boolean
  ssoProviderId: string
  enableOAuth: boolean
  oauthProviderId: string
  oauthAllowedDomains: string
  enableBasicAuth: boolean
  basicAuthUser: string
  basicAuthPass: string
  enableIpAllowlist: boolean
  ipAllowlist: string
  enableRateLimit: boolean
  rateLimitReqs: number
  rateLimitWindow: string
  wafMode: 'off' | 'detection' | 'blocking'
}

const defaultConfig: Config = {
  routeId: '',
  enableSSO: false,
  ssoProviderId: '',
  enableOAuth: false,
  oauthProviderId: '',
  oauthAllowedDomains: '',
  enableBasicAuth: false,
  basicAuthUser: '',
  basicAuthPass: '',
  enableIpAllowlist: false,
  ipAllowlist: '',
  enableRateLimit: false,
  rateLimitReqs: 100,
  rateLimitWindow: '1m',
  wafMode: 'off',
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 12,
} as const

export default function ProtectPage() {
  const router = useRouter()
  const [handleError] = useErrorHandler()
  const [step, setStep] = useState<Step>('route')
  const [cfg, setCfg] = useState<Config>(defaultConfig)

  const routes = trpc.routes.list.useQuery()
  const ssoProviders = trpc.sso.list.useQuery()
  const oauthProviders = trpc.oauthProviders.list.useQuery()
  const updateMut = trpc.routes.update.useMutation({
    onSuccess: () => router.push(`/routes/${cfg.routeId}`),
    onError: handleError,
  })

  const patch = (partial: Partial<Config>) => setCfg(prev => ({ ...prev, ...partial }))

  const selectedRoute = routes.data?.find(r => r.id === cfg.routeId)

  function applyProtection() {
    const update: Record<string, unknown> = { id: cfg.routeId, patch: {} }
    const p = update.patch as Record<string, unknown>

    if (cfg.enableSSO && cfg.ssoProviderId) {
      p.ssoEnabled = true
      p.ssoProviderId = cfg.ssoProviderId
    }
    if (cfg.enableOAuth && cfg.oauthProviderId) {
      p.oauthProxyProviderId = cfg.oauthProviderId
      if (cfg.oauthAllowedDomains) {
        p.oauthProxyAllowlist = cfg.oauthAllowedDomains.split(',').map(d => d.trim()).filter(Boolean)
      }
    }
    if (cfg.enableBasicAuth && cfg.basicAuthUser) {
      p.basicAuth = { username: cfg.basicAuthUser, password: cfg.basicAuthPass }
    }
    if (cfg.enableIpAllowlist && cfg.ipAllowlist) {
      p.ipAllowlist = cfg.ipAllowlist.split(',').map(ip => ip.trim()).filter(Boolean)
    }
    if (cfg.enableRateLimit) {
      p.rateLimit = { requests: cfg.rateLimitReqs, window: cfg.rateLimitWindow }
    }
    if (cfg.wafMode !== 'off') {
      p.wafMode = cfg.wafMode
    }

    updateMut.mutate(update as Parameters<typeof updateMut.mutate>[0])
  }

  const currentIdx = STEPS.indexOf(step)

  return (
    <>
      <Topbar title="Protect service" />
      <PageContent>
        <PageHeader
          title="Protect this service"
          desc="Step-by-step wizard to layer authentication, access control, rate limiting, and WAF onto any route."
        />

        {/* Step progress */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
              color: s === step ? 'var(--accent)' : i < currentIdx ? 'var(--text2)' : 'var(--text3)',
              fontWeight: s === step ? 600 : 400 }}>
              {i > 0 && <span style={{ color: 'var(--border)' }}>›</span>}
              {STEP_LABELS[s]}
            </div>
          ))}
        </div>

        {/* Step: route */}
        {step === 'route' && (
          <Card header={<span>Select a route to protect</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Route</div>
              <select value={cfg.routeId} onChange={e => patch({ routeId: e.target.value })} style={inputStyle}>
                <option value="">Choose route…</option>
                {routes.data?.filter(r => !r.archivedAt).map(r => (
                  <option key={r.id} value={r.id}>{r.domain}</option>
                ))}
              </select>
              {selectedRoute && (
                <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 8px', borderRadius: 4 }}>
                  {selectedRoute.upstreams[0]?.address} — TLS: {selectedRoute.tlsMode} — SSO: {selectedRoute.ssoEnabled ? 'on' : 'off'}
                </div>
              )}
              <Button variant="primary" onClick={() => setStep('auth')} disabled={!cfg.routeId} style={{ alignSelf: 'flex-start' }}>
                Next →
              </Button>
            </div>
          </Card>
        )}

        {/* Step: auth */}
        {step === 'auth' && (
          <Card header={<span>Authentication</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.enableSSO} onChange={e => patch({ enableSSO: e.target.checked })} />
                Forward auth (SSO via Authentik / Authelia / Keycloak)
              </label>
              {cfg.enableSSO && (
                <select value={cfg.ssoProviderId} onChange={e => patch({ ssoProviderId: e.target.value })} style={{ ...inputStyle, marginLeft: 24 }}>
                  <option value="">Select SSO provider…</option>
                  {ssoProviders.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}

              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.enableOAuth} onChange={e => patch({ enableOAuth: e.target.checked })} />
                OAuth2 proxy (GitHub / Google / Microsoft / OIDC)
              </label>
              {cfg.enableOAuth && (
                <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <select value={cfg.oauthProviderId} onChange={e => patch({ oauthProviderId: e.target.value })} style={inputStyle}>
                    <option value="">Select OAuth provider…</option>
                    {oauthProviders.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input value={cfg.oauthAllowedDomains} onChange={e => patch({ oauthAllowedDomains: e.target.value })}
                    placeholder="Allowed email domains (optional, comma-separated)" style={inputStyle} />
                </div>
              )}

              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.enableBasicAuth} onChange={e => patch({ enableBasicAuth: e.target.checked })} />
                HTTP Basic auth
              </label>
              {cfg.enableBasicAuth && (
                <div style={{ marginLeft: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input value={cfg.basicAuthUser} onChange={e => patch({ basicAuthUser: e.target.value })}
                    placeholder="Username" style={inputStyle} />
                  <input type="password" value={cfg.basicAuthPass} onChange={e => patch({ basicAuthPass: e.target.value })}
                    placeholder="Password" style={inputStyle} />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" onClick={() => setStep('route')}>← Back</Button>
                <Button variant="primary" onClick={() => setStep('access')}>Next →</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step: access control */}
        {step === 'access' && (
          <Card header={<span>Access control</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.enableIpAllowlist} onChange={e => patch({ enableIpAllowlist: e.target.checked })} />
                IP allowlist
              </label>
              {cfg.enableIpAllowlist && (
                <input value={cfg.ipAllowlist} onChange={e => patch({ ipAllowlist: e.target.value })}
                  placeholder="192.168.1.0/24, 10.0.0.1 (comma-separated)" style={{ ...inputStyle, marginLeft: 24 }} />
              )}

              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.enableRateLimit} onChange={e => patch({ enableRateLimit: e.target.checked })} />
                Rate limiting
              </label>
              {cfg.enableRateLimit && (
                <div style={{ marginLeft: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Requests</div>
                    <input type="number" value={cfg.rateLimitReqs} onChange={e => patch({ rateLimitReqs: parseInt(e.target.value) || 100 })} style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Window</div>
                    <select value={cfg.rateLimitWindow} onChange={e => patch({ rateLimitWindow: e.target.value })} style={inputStyle}>
                      <option value="1s">1 second</option>
                      <option value="10s">10 seconds</option>
                      <option value="1m">1 minute</option>
                      <option value="5m">5 minutes</option>
                      <option value="1h">1 hour</option>
                    </select>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" onClick={() => setStep('auth')}>← Back</Button>
                <Button variant="primary" onClick={() => setStep('waf')}>Next →</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step: WAF */}
        {step === 'waf' && (
          <Card header={<span>Web Application Firewall</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                Enable the Coraza WAF (OWASP Core Rule Set) to protect against SQL injection, XSS, and other common attacks.
              </div>
              {(['off', 'detection', 'blocking'] as const).map(mode => (
                <label key={mode} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="wafMode" value={mode} checked={cfg.wafMode === mode} onChange={() => patch({ wafMode: mode })} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{mode === 'off' ? 'Off' : mode === 'detection' ? 'Detection only' : 'Blocking'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                      {mode === 'off' && 'No WAF — maximum performance.'}
                      {mode === 'detection' && 'Log rule matches but allow traffic through. Good for tuning before blocking.'}
                      {mode === 'blocking' && 'Block requests matching WAF rules. Recommended for public-facing services.'}
                    </div>
                  </div>
                </label>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" onClick={() => setStep('access')}>← Back</Button>
                <Button variant="primary" onClick={() => setStep('review')}>Next →</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step: review */}
        {step === 'review' && (
          <Card header={<span>Review & apply</span>}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                Applying to: <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedRoute?.domain}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cfg.enableSSO && <div style={{ fontSize: 12 }}>✓ Forward auth SSO</div>}
                {cfg.enableOAuth && <div style={{ fontSize: 12 }}>✓ OAuth2 proxy</div>}
                {cfg.enableBasicAuth && <div style={{ fontSize: 12 }}>✓ HTTP Basic auth ({cfg.basicAuthUser})</div>}
                {cfg.enableIpAllowlist && <div style={{ fontSize: 12 }}>✓ IP allowlist</div>}
                {cfg.enableRateLimit && <div style={{ fontSize: 12 }}>✓ Rate limit: {cfg.rateLimitReqs} req / {cfg.rateLimitWindow}</div>}
                {cfg.wafMode !== 'off' && <div style={{ fontSize: 12 }}>✓ WAF: {cfg.wafMode}</div>}
                {!cfg.enableSSO && !cfg.enableOAuth && !cfg.enableBasicAuth && !cfg.enableIpAllowlist && !cfg.enableRateLimit && cfg.wafMode === 'off' && (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>No protection layers selected.</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" onClick={() => setStep('waf')}>← Back</Button>
                <Button variant="primary" onClick={applyProtection} disabled={updateMut.isPending}>
                  {updateMut.isPending ? 'Applying…' : 'Apply protection'}
                </Button>
              </div>
              {updateMut.isError && (
                <div style={{ fontSize: 11, color: 'var(--red)' }}>{updateMut.error.message}</div>
              )}
            </div>
          </Card>
        )}
      </PageContent>
    </>
  )
}
