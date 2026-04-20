import { describe, it, expect } from 'vitest'
import { buildCaddyRoute, buildTrustedProxies } from '../config'
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

describe('buildCaddyRoute', () => {
  describe('HTTP upstream', () => {
    it('reverse_proxy handler exists with no transport for plain HTTP', () => {
      const rp = getReverseProxy(makeRoute({ upstreams: [{ address: '10.0.0.1:80' }] }))
      expect(rp).toBeDefined()
      expect(rp.transport).toBeUndefined()
      expect(rp.headers.request.set.Host[0]).toBe('{http.request.host}')
    })
  })

  describe('HTTPS upstream detection', () => {
    it('emits transport for https:// scheme upstream with insecure_skip_verify false', () => {
      // port 8080 is not in HTTPS_PORTS, so only scheme triggers HTTPS detection — no skip-verify
      const rp = getReverseProxy(makeRoute({ upstreams: [{ address: 'https://10.0.0.1:8080' }] }))
      expect(rp.transport).toBeDefined()
      expect(rp.transport.protocol).toBe('http')
      expect(rp.transport.tls.insecure_skip_verify).toBe(false)
    })

    it('emits transport with skip-verify for Proxmox port 8006', () => {
      const rp = getReverseProxy(makeRoute({ upstreams: [{ address: '192.168.69.4:8006' }] }))
      expect(rp.transport).toBeDefined()
      expect(rp.transport.tls.insecure_skip_verify).toBe(true)
    })

    it('emits transport with skip-verify for PBS port 8007', () => {
      const rp = getReverseProxy(makeRoute({ upstreams: [{ address: '192.168.69.21:8007' }] }))
      expect(rp.transport).toBeDefined()
      expect(rp.transport.tls.insecure_skip_verify).toBe(true)
    })

    it('emits transport with skip-verify for Cockpit port 9090', () => {
      const rp = getReverseProxy(makeRoute({ upstreams: [{ address: '192.168.80.11:9090' }] }))
      expect(rp.transport).toBeDefined()
      expect(rp.transport.tls.insecure_skip_verify).toBe(true)
    })

    // Test 6: Same HTTPS address as test 2 (port 8080, not in HTTPS_PORTS)
    // — the ONLY difference vs test 2 is skipTlsVerify: true on the route.
    // Test 2 expects insecure_skip_verify: false; this test expects true.
    // The diff isolates route.skipTlsVerify's effect on the output.
    it('emits transport with skip-verify when route.skipTlsVerify is true', () => {
      const rp = getReverseProxy(makeRoute({ upstreams: [{ address: 'https://10.0.0.1:8080' }], skipTlsVerify: true }))
      expect(rp.transport).toBeDefined()
      expect(rp.transport.tls.insecure_skip_verify).toBe(true)
    })

    it('emits transport with skip-verify when per-upstream skipVerify is true', () => {
      const rp = getReverseProxy(makeRoute({
        upstreams: [{ address: '10.0.0.1:443', skipVerify: true }],
      }))
      expect(rp.transport).toBeDefined()
      expect(rp.transport.tls.insecure_skip_verify).toBe(true)
    })

    it('emits transport when any upstream is HTTPS (mixed schemes)', () => {
      const rp = getReverseProxy(makeRoute({
        upstreams: [
          { address: '10.0.0.1:80' },
          { address: 'https://10.0.0.2:443' },
        ],
      }))
      expect(rp.transport).toBeDefined()
    })
  })

  describe('headers', () => {
    it('emits Host and X-Real-IP; no X-Forwarded-* in route headers', () => {
      const rp = getReverseProxy(makeRoute())
      const set = rp.headers.request.set
      expect(set['Host']).toBeDefined()
      expect(set['X-Real-IP']).toBeDefined()
      // X-Forwarded-* managed natively by Caddy trusted_proxies — not set at route level
      expect(set['X-Forwarded-Proto']).toBeUndefined()
      expect(set['X-Forwarded-Host']).toBeUndefined()
      expect(set['X-Forwarded-For']).toBeUndefined()
      expect(set['X-Forwarded-Port']).toBeUndefined()
      expect(rp.headers.request.add?.['X-Forwarded-For']).toBeUndefined()
    })

    it('Host header value is the Caddy request-host placeholder', () => {
      const rp = getReverseProxy(makeRoute())
      expect(rp.headers.request.set.Host[0]).toBe('{http.request.host}')
    })

    it('X-Real-IP is set to remote host placeholder', () => {
      const rp = getReverseProxy(makeRoute())
      expect(rp.headers.request.set['X-Real-IP'][0]).toBe('{http.request.remote.host}')
    })
  })

  describe('buildTrustedProxies', () => {
    it('configures trusted_proxies with source static and Cloudflare ranges', () => {
      const tp = buildTrustedProxies()
      expect(tp.source).toBe('static')
      expect(tp.ranges).toContain('173.245.48.0/20')
      expect(tp.ranges).toContain('104.16.0.0/13')
    })

    it('includes private LAN ranges', () => {
      const tp = buildTrustedProxies()
      expect(tp.ranges).toContain('10.0.0.0/8')
      expect(tp.ranges).toContain('192.168.0.0/16')
      expect(tp.ranges).toContain('172.16.0.0/12')
    })

    it('includes Tailscale CGNAT range', () => {
      const tp = buildTrustedProxies()
      expect(tp.ranges).toContain('100.64.0.0/10')
    })

    it('includes Docker bridge network ranges', () => {
      const tp = buildTrustedProxies()
      expect(tp.ranges).toContain('172.17.0.0/16')
    })
  })

  describe('health checks', () => {
    it('emits health_checks when healthCheckEnabled is true', () => {
      const rp = getReverseProxy(makeRoute({
        healthCheckEnabled: true,
        healthCheckPath: '/health',
        healthCheckInterval: 30,
      }))
      expect(rp.health_checks.active.path).toBe('/health')
      expect(rp.health_checks.active.interval).toBe('30s')
    })

    it('omits health_checks when healthCheckEnabled is false', () => {
      const rp = getReverseProxy(makeRoute({ healthCheckEnabled: false }))
      expect(rp.health_checks).toBeUndefined()
    })
  })

  describe('blue-green traffic split', () => {
    it('merges production and staging upstreams with weights when trafficSplitPct is set', () => {
      const rp = getReverseProxy(makeRoute({
        upstreams: [{ address: '10.0.0.1:80' }],
        stagingUpstreams: [{ address: '10.0.0.2:80' }],
        trafficSplitPct: 20,
      }))
      const upstreams = rp.upstreams as Array<{ dial: string; weight?: number }>
      expect(upstreams.length).toBe(2)
      const dials = upstreams.map(u => u.dial)
      expect(dials).toContain('10.0.0.1:80')
      expect(dials).toContain('10.0.0.2:80')
      expect(upstreams.every(u => u.weight !== undefined)).toBe(true)
    })
  })

  describe('authentication', () => {
    it('places forward_auth handler before reverse_proxy when SSO is enabled', () => {
      const result = buildCaddyRoute(
        makeRoute({ ssoEnabled: true }),
        {
          ssoProvider: {
            forwardAuthUrl: 'http://sso.internal/auth',
            authResponseHeaders: ['X-Auth-User'],
          } as any,
        },
      )
      const handlers = result.handle as Array<{ handler: string }>
      const faIdx = handlers.findIndex(h => h.handler === 'forward_auth')
      const rpIdx = handlers.findIndex(h => h.handler === 'reverse_proxy')
      expect(faIdx).toBeGreaterThanOrEqual(0)
      expect(faIdx).toBeLessThan(rpIdx)
    })

    it('emits authentication handler with http_basic accounts for basicAuth', () => {
      const result = buildCaddyRoute(makeRoute({
        basicAuth: { username: 'admin', password: 'hashed-pw' },
      }))
      const auth = result.handle.find(h => (h as any).handler === 'authentication') as any
      expect(auth).toBeDefined()
      expect(auth.providers.http_basic.accounts[0].username).toBe('admin')
    })
  })

  describe('security handlers', () => {
    it('emits rate_limit handler when rateLimit is configured', () => {
      const result = buildCaddyRoute(makeRoute({
        rateLimit: { requests: 100, window: '1m', key: '{remote_host}' },
      }))
      const rl = result.handle.find(h => (h as any).handler === 'rate_limit') as any
      expect(rl).toBeDefined()
    })

    it('emits waf handler with enforcement:block in blocking mode', () => {
      const result = buildCaddyRoute(makeRoute({ wafMode: 'blocking' }))
      const waf = result.handle.find(h => (h as any).handler === 'waf') as any
      expect(waf).toBeDefined()
      expect(waf.enforcement).toBe('block')
    })

    it('emits waf handler with enforcement:detect in detect mode', () => {
      const result = buildCaddyRoute(makeRoute({ wafMode: 'detection' }))
      const waf = result.handle.find(h => (h as any).handler === 'waf') as any
      expect(waf).toBeDefined()
      expect(waf.enforcement).toBe('detect')
    })
  })

  describe('response headers', () => {
    it('emits Strict-Transport-Security header when HSTS is enabled and TLS is not off', () => {
      const result = buildCaddyRoute(makeRoute({
        hstsEnabled: true,
        tlsMode: 'auto',
      }))
      const hdrs = result.handle.find(h => {
        const hh = h as any
        return hh.handler === 'headers' && hh.response?.set?.['Strict-Transport-Security']
      }) as any
      expect(hdrs).toBeDefined()
      expect(hdrs.response.set['Strict-Transport-Security'][0]).toContain('max-age=')
    })
  })

  describe('compression', () => {
    it('emits encode handler with gzip and zstd when compressionEnabled is true', () => {
      const result = buildCaddyRoute(makeRoute({ compressionEnabled: true }))
      const enc = result.handle.find(h => (h as any).handler === 'encode') as any
      expect(enc).toBeDefined()
      expect(enc.encodings.gzip).toBeDefined()
      expect(enc.encodings.zstd).toBeDefined()
    })
  })

  describe('geoip', () => {
    it('emits subroute returning 403 for blocklisted countries', () => {
      const result = buildCaddyRoute(makeRoute(), {
        geoipConfig: { mode: 'blocklist', countries: ['CN'], action: 'block' },
      })
      const sr = result.handle.find(h => (h as any).handler === 'subroute') as any
      expect(sr).toBeDefined()
      const innerRoute = sr.routes[0]
      const response = innerRoute.handle.find((h: any) => h.handler === 'static_response')
      expect(response.status_code).toBe(403)
    })
  })

  describe('matcher', () => {
    it('sets remote_ip ranges in match[0] for IP allowlist', () => {
      const result = buildCaddyRoute(makeRoute({ ipAllowlist: ['10.0.0.0/8'] }))
      const matcher = result.match![0] as any
      expect(matcher.remote_ip.ranges).toContain('10.0.0.0/8')
    })

    it('sets terminal:true on the output route', () => {
      const result = buildCaddyRoute(makeRoute())
      expect(result.terminal).toBe(true)
    })
  })

  describe('load balancing', () => {
    it('emits load_balancing with the given policy for multiple upstreams', () => {
      const rp = getReverseProxy(makeRoute({
        upstreams: [{ address: '10.0.0.1:80' }, { address: '10.0.0.2:80' }],
        lbPolicy: 'least_conn',
      }))
      expect(rp.load_balancing.selection_policy.policy).toBe('least_conn')
    })
  })

  describe('identity', () => {
    it('@id is deterministic from the route id', () => {
      const result = buildCaddyRoute(makeRoute({ id: 'xyz' }))
      expect(result['@id']).toBe('proxyos-route-xyz')
    })
  })
})
