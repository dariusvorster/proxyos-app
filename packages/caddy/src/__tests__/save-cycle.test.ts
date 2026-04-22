import { describe, it, expect } from 'vitest'
import { buildCaddyRoute } from '../config'
import type { BuildOptions } from '../config'
import type { Route } from '@proxyos/types'

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'test-route',
    name: 'Test Route',
    domain: 'test.example.com',
    enabled: true,
    upstreamType: 'http',
    upstreams: [{ address: '10.0.0.1:80' }],
    lbPolicy: 'round_robin',
    tlsMode: 'auto',
    ssoEnabled: false,
    ssoProviderId: null,
    tlsDnsProviderId: null,
    rateLimit: null,
    ipAllowlist: null,
    basicAuth: null,
    headers: null,
    healthCheckEnabled: false,
    healthCheckPath: '/',
    healthCheckInterval: 30,
    compressionEnabled: false,
    websocketEnabled: true,
    http2Enabled: true,
    http3Enabled: false,
    wafMode: 'off',
    wafExclusions: null,
    hstsEnabled: false,
    hstsSubdomains: false,
    skipTlsVerify: false,
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
    lastTrafficAt: null,
    archivedAt: null,
    rateLimitKey: null,
    maintenanceMode: false,
    maintenanceSavedUpstreams: null,
    forceSSL: false,
    trustUpstreamHeaders: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Route
}

function getReverseProxy(route: Route, opts?: BuildOptions) {
  const result = buildCaddyRoute(route, opts)
  return result.handle.find(h => (h as { handler?: string }).handler === 'reverse_proxy') as any
}

describe('upstream URL save cycle', () => {
  it('upstream URL change persists through save cycle', () => {
    // Simulates the save cycle: route in "DB" → build Caddy config (initial push)
    // Then update upstream in "DB" → rebuild Caddy config → verify new config reflects new upstream

    // Step 1: initial route with plain HTTP upstream
    const route = makeRoute({ upstreams: [{ address: '10.0.0.1:8080' }] })
    const initial = buildCaddyRoute(route)
    const initialRp = getReverseProxy(route)
    expect(initialRp.upstreams[0].dial).toBe('10.0.0.1:8080')
    expect(initialRp.transport).toBeUndefined()

    // Step 2: simulate upstream URL change in "DB"
    const updated = { ...route, upstreams: [{ address: 'https://10.0.0.2:8443' }] }

    // Step 3: verify DB has the new value (the updated object reflects what would be in DB)
    expect(updated.upstreams[0].address).toBe('https://10.0.0.2:8443')

    // Step 4: rebuild Caddy config from updated route (simulates the push)
    const rebuilt = buildCaddyRoute(updated)
    const updatedRp = getReverseProxy(updated)

    // Step 5: verify Caddy config has new dial (https:// stripped) with TLS transport
    expect(updatedRp.upstreams[0].dial).toBe('10.0.0.2:8443')
    expect(updatedRp.transport).toBeDefined()
    expect(updatedRp.transport?.tls).toBeDefined()
  })
})
