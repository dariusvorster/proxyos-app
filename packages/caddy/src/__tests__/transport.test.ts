import { describe, it, expect } from 'vitest'
import { buildCaddyRoute } from '../config'
import type { Route } from '@proxyos/types'

function makeRoute(overrides: Partial<Route>): Route {
  return {
    id: 'r1',
    name: 'test',
    domain: 'test.example.com',
    enabled: true,
    upstreamType: 'http',
    upstreams: [{ address: 'app:3000' }],
    tlsMode: 'off',
    tlsDnsProviderId: null,
    ssoEnabled: false,
    ssoProviderId: null,
    rateLimit: null,
    ipAllowlist: null,
    basicAuth: null,
    headers: null,
    lbPolicy: 'round_robin',
    healthCheckEnabled: false,
    healthCheckPath: '/',
    healthCheckInterval: 30,
    compressionEnabled: false,
    websocketEnabled: false,
    http2Enabled: false,
    http3Enabled: false,
    lastTrafficAt: null,
    archivedAt: null,
    wafMode: 'off',
    wafExclusions: null,
    rateLimitKey: null,
    tunnelProviderId: null,
    oauthProxyProviderId: null,
    oauthProxyAllowlist: null,
    stagingUpstreams: null,
    trafficSplitPct: null,
    mirrorUpstream: null,
    mirrorSampleRate: null,
    accessosGroups: null,
    accessosProviderId: null,
    mxwatchDomain: null,
    maintenanceMode: false,
    maintenanceSavedUpstreams: null,
    forceSSL: false,
    hstsEnabled: false,
    hstsSubdomains: false,
    trustUpstreamHeaders: false,
    skipTlsVerify: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Route
}

function getReverseProxy(route: Route) {
  const caddyRoute = buildCaddyRoute(route)
  const handler = (caddyRoute.handle as unknown[]).find(
    (h: unknown) => (h as { handler: string }).handler === 'reverse_proxy'
  ) as Record<string, unknown>
  return handler
}

describe('transport block emission', () => {
  it('emits no transport for plain http upstream', () => {
    const rp = getReverseProxy(makeRoute({ upstreams: [{ address: 'app:3000' }] }))
    expect(rp.transport).toBeUndefined()
  })

  it('emits transport for https:// upstream with explicit port', () => {
    // port 4443 is not in HTTPS_PORTS — only scheme-based detection fires, so skip-verify stays false
    const rp = getReverseProxy(makeRoute({ upstreams: [{ address: 'https://192.168.69.5:4443' }] }))
    expect(rp.transport).toMatchObject({ protocol: 'http', tls: { insecure_skip_verify: false } })
  })

  it('emits transport for https:// upstream with default port 443', () => {
    const rp = getReverseProxy(makeRoute({ upstreams: [{ address: 'https://example.com' }] }))
    const upstreams = rp.upstreams as Array<{ dial: string }>
    expect(upstreams[0]!.dial).toBe('example.com:443')
    expect(rp.transport).toMatchObject({ protocol: 'http' })
  })

  it('emits transport with insecure_skip_verify:true when route.skipTlsVerify is set', () => {
    const rp = getReverseProxy(makeRoute({
      upstreams: [{ address: 'https://192.168.69.5:8006' }],
      skipTlsVerify: true,
    }))
    expect(rp.transport).toMatchObject({ protocol: 'http', tls: { insecure_skip_verify: true } })
  })

  it('emits transport with insecure_skip_verify:true when upstream.skipVerify is set (from static upstream)', () => {
    const rp = getReverseProxy(makeRoute({
      upstreams: [{ address: 'https://192.168.69.5:8006', skipVerify: true }],
    }))
    expect(rp.transport).toMatchObject({ protocol: 'http', tls: { insecure_skip_verify: true } })
  })

  it('dial strips scheme and uses correct port for http upstream', () => {
    const rp = getReverseProxy(makeRoute({ upstreams: [{ address: 'http://app:3000' }] }))
    const upstreams = rp.upstreams as Array<{ dial: string }>
    expect(upstreams[0]!.dial).toBe('app:3000')
    expect(rp.transport).toBeUndefined()
  })

  it('falls through to bare container:port without transport', () => {
    const rp = getReverseProxy(makeRoute({ upstreams: [{ address: 'vaultwarden:80' }] }))
    const upstreams = rp.upstreams as Array<{ dial: string }>
    expect(upstreams[0]!.dial).toBe('vaultwarden:80')
    expect(rp.transport).toBeUndefined()
  })
})
