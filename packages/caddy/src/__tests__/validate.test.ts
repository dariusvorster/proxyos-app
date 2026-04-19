import { describe, it, expect } from 'vitest'
import { buildCaddyRoute } from '../config'
import { validateCaddyRoute, formatValidation } from '../validate'
import type { CaddyRoute } from '../types'
import type { Route } from '@proxyos/types'

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'v-route',
    name: 'Validate Test',
    domain: 'validate.example.com',
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
    websocketEnabled: false,
    http2Enabled: false,
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

function validCaddyRoute(): CaddyRoute {
  return buildCaddyRoute(makeRoute())
}

describe('validateCaddyRoute', () => {
  it('V1: valid route from buildCaddyRoute passes with no errors', () => {
    const result = validateCaddyRoute(validCaddyRoute())
    expect(result.valid).toBe(true)
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('V2: route without Host header in reverse_proxy fails with field mentioning Host', () => {
    const caddyRoute = validCaddyRoute()
    const rp = caddyRoute.handle.find(h => h.handler === 'reverse_proxy') as any
    delete (rp.headers as any).request.set['Host']
    const result = validateCaddyRoute(caddyRoute)
    expect(result.valid).toBe(false)
    const issue = result.issues.find(i => i.field.includes('Host'))
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('error')
  })

  it('V3: HTTPS-port upstream (8006) with no transport block fails', () => {
    const caddyRoute = buildCaddyRoute(makeRoute({ upstreams: [{ address: '192.168.69.4:8006' }] }))
    const rp = caddyRoute.handle.find(h => h.handler === 'reverse_proxy') as any
    delete rp.transport
    const result = validateCaddyRoute(caddyRoute)
    expect(result.valid).toBe(false)
    const issue = result.issues.find(i => i.field.includes('transport'))
    expect(issue).toBeDefined()
    expect(issue?.message).toMatch(/transport/)
  })

  it('V4: empty upstreams array fails', () => {
    const caddyRoute = validCaddyRoute()
    const rp = caddyRoute.handle.find(h => h.handler === 'reverse_proxy') as any
    rp.upstreams = []
    const result = validateCaddyRoute(caddyRoute)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.field.includes('upstreams'))).toBe(true)
  })

  it('V5: malformed dial (no port) fails', () => {
    const caddyRoute = validCaddyRoute()
    const rp = caddyRoute.handle.find(h => h.handler === 'reverse_proxy') as any
    rp.upstreams = [{ dial: 'no-port-here' }]
    const result = validateCaddyRoute(caddyRoute)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.field.includes('dial'))).toBe(true)
  })

  it('V6: route missing @id fails', () => {
    const caddyRoute = validCaddyRoute()
    delete (caddyRoute as any)['@id']
    const result = validateCaddyRoute(caddyRoute)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.field === '@id')).toBe(true)
  })

  it('V7: route with no X-Forwarded-Port is valid but has 1 warning', () => {
    const caddyRoute = validCaddyRoute()
    const rp = caddyRoute.handle.find(h => h.handler === 'reverse_proxy') as any
    delete (rp.headers as any).request.set['X-Forwarded-Port']
    const result = validateCaddyRoute(caddyRoute)
    expect(result.valid).toBe(true)
    const warnings = result.issues.filter(i => i.severity === 'warning')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.field).toContain('X-Forwarded-Port')
  })

  it('V8: formatValidation output contains route id, counts, and each issue field + message', () => {
    const caddyRoute = validCaddyRoute()
    const rp = caddyRoute.handle.find(h => h.handler === 'reverse_proxy') as any
    delete (rp.headers as any).request.set['Host']
    delete (rp.headers as any).request.set['X-Forwarded-Port']
    const result = validateCaddyRoute(caddyRoute)
    const output = formatValidation(result)
    expect(output).toContain('proxyos-route-v-route')
    expect(output).toMatch(/\d+ error/)
    expect(output).toContain('Host')
    expect(output).toContain('X-Forwarded-Port')
    expect(output).toMatch(/ERROR/)
    expect(output).toMatch(/WARN/)
  })
})
