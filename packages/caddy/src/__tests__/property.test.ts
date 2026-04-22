import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { buildCaddyRoute } from '../config'
import { applyDockerDns } from '../apply-docker-dns'
import type { Route } from '@proxyos/types'

// Arbitrary for upstream address variants
const upstreamAddressArb = fc.oneof(
  fc.constant('10.0.0.1:8080'),
  fc.constant('https://10.0.0.1:8443'),
  fc.constant('192.168.1.100:3000'),
  fc.constant('mycontainer:8080'),
)

// Arbitrary for a minimal valid Route
const routeArb: fc.Arbitrary<Route> = fc.record({
  id: fc.stringMatching(/^[0-9a-f]{8,16}$/),
  name: fc.string({ minLength: 1, maxLength: 64 }),
  domain: fc.constantFrom('test.example.com', 'app.local', 'service.homelab'),
  enabled: fc.boolean(),
  upstreamType: fc.constant('http'),
  upstreams: fc.array(
    fc.record({ address: upstreamAddressArb }),
    { minLength: 1, maxLength: 3 },
  ),
  lbPolicy: fc.constantFrom('round_robin', 'first', 'random'),
  tlsMode: fc.constantFrom('auto', 'off'),
  ssoEnabled: fc.constant(false),
  ssoProviderId: fc.constant(null),
  tlsDnsProviderId: fc.constant(null),
  rateLimit: fc.constant(null),
  ipAllowlist: fc.constant(null),
  basicAuth: fc.constant(null),
  headers: fc.constant(null),
  healthCheckEnabled: fc.constant(false),
  healthCheckPath: fc.constant('/'),
  healthCheckInterval: fc.constant(30),
  compressionEnabled: fc.constant(false),
  websocketEnabled: fc.boolean(),
  http2Enabled: fc.boolean(),
  http3Enabled: fc.constant(false),
  wafMode: fc.constant('off'),
  wafExclusions: fc.constant(null),
  hstsEnabled: fc.constant(false),
  hstsSubdomains: fc.constant(false),
  skipTlsVerify: fc.constant(false),
  tunnelProviderId: fc.constant(null),
  oauthProxyProviderId: fc.constant(null),
  oauthProxyAllowlist: fc.constant(null),
  stagingUpstreams: fc.constant(null),
  trafficSplitPct: fc.constant(null),
  mirrorUpstream: fc.constant(null),
  mirrorSampleRate: fc.constant(null),
  accessosGroups: fc.constant(null),
  accessosProviderId: fc.constant(null),
  mxwatchDomain: fc.constant(null),
  lastTrafficAt: fc.constant(null),
  archivedAt: fc.constant(null),
  rateLimitKey: fc.constant(null),
  maintenanceMode: fc.constant(false),
  maintenanceSavedUpstreams: fc.constant(null),
  forceSSL: fc.constant(false),
  trustUpstreamHeaders: fc.constant(false),
  createdAt: fc.constant(new Date('2026-01-01')),
  updatedAt: fc.constant(new Date('2026-01-01')),
}) as fc.Arbitrary<Route>

describe('buildCaddyRoute — property tests', () => {
  it('P1: always produces valid JSON', () => {
    fc.assert(fc.property(routeArb, (route) => {
      const result = buildCaddyRoute(route)
      const json = JSON.stringify(result)
      expect(() => JSON.parse(json)).not.toThrow()
    }))
  })

  it('P2: reverse_proxy handler always present', () => {
    fc.assert(fc.property(routeArb, (route) => {
      const result = buildCaddyRoute(route)
      const rp = result.handle.find(h => (h as any).handler === 'reverse_proxy')
      expect(rp).toBeDefined()
    }))
  })

  it('P3: no malformed placeholder strings in string values of JSON output', () => {
    fc.assert(fc.property(routeArb, (route) => {
      const result = buildCaddyRoute(route)
      const json = JSON.stringify(result)
      // Extract all string values from the JSON and check for broken placeholder syntax.
      // Caddy placeholders like {http.request.xxx} are valid.
      // Broken/nested placeholders like {{xxx}} are bugs.
      // We scan quoted string values only (not structural JSON braces).
      const stringValues = json.match(/"([^"\\]|\\.)*"/g) ?? []
      for (const val of stringValues) {
        expect(val).not.toMatch(/\{\{/)
      }
    }))
  })

  it('P4: applyDockerDns always sets resolver on reverse_proxy transport', () => {
    fc.assert(fc.property(routeArb, (route) => {
      const result = applyDockerDns(buildCaddyRoute(route))
      const rp = result.handle.find(h => (h as any).handler === 'reverse_proxy') as any
      expect(rp?.transport?.resolvers).toContain('127.0.0.11')
    }))
  })
})
