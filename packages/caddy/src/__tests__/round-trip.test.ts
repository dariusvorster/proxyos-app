import { describe, it, expect, afterAll } from 'vitest'
import { buildCaddyRoute } from '../config'
import { CaddyClient } from '../client'
import type { Route } from '@proxyos/types'

// Integration test — only runs when CADDY_ADMIN_URL env var is set
const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL
const runIntegration = CADDY_ADMIN_URL ? it : it.skip

const TEST_ROUTE_ID = 'proxyos-roundtrip-test'

function makeTestRoute(): Route {
  return {
    id: TEST_ROUTE_ID,
    name: 'Round-trip Test Route',
    domain: 'roundtrip-test.local',
    enabled: true,
    upstreamType: 'http',
    upstreams: [{ address: process.env.TEST_UPSTREAM_ADDR ?? 'localhost:19999' }],
    lbPolicy: 'round_robin',
    tlsMode: 'off',
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
  } as Route
}

describe('Caddy config round-trip (integration)', () => {
  const client = CADDY_ADMIN_URL
    ? new CaddyClient({ baseUrl: CADDY_ADMIN_URL, serverName: 'main' })
    : null

  afterAll(async () => {
    if (client) {
      await client.removeRoute(TEST_ROUTE_ID).catch(() => {})
    }
  })

  runIntegration('RT1: generated route config is accepted by Caddy', async () => {
    const route = makeTestRoute()
    const caddyRoute = buildCaddyRoute(route)
    await expect(client!.addRoute(caddyRoute)).resolves.not.toThrow()
  })

  runIntegration('RT2: pushed route is fetchable from Caddy Admin API', async () => {
    const expected = buildCaddyRoute(makeTestRoute())
    const result = await client!.verifyRoute(TEST_ROUTE_ID, expected)
    expect(result.actual).toBeDefined()
    expect(result.status).not.toBe('missing')
    expect(result.status).not.toBe('error')
    const actual = result.actual as Record<string, unknown>
    expect(actual['@id']).toBe(`proxyos-${TEST_ROUTE_ID}`)
  })

  runIntegration('RT3: fetched route has expected upstream dial', async () => {
    const expected = buildCaddyRoute(makeTestRoute())
    const result = await client!.verifyRoute(TEST_ROUTE_ID, expected)
    const actual = result.actual as Record<string, unknown> | null
    expect(actual).not.toBeNull()
    const handles = (actual?.handle ?? []) as Array<Record<string, unknown>>
    const rp = handles.find((h) => h.handler === 'reverse_proxy')
    expect(rp).toBeDefined()
    const upstreams = (rp?.upstreams ?? []) as Array<Record<string, unknown>>
    const expectedDial = (process.env.TEST_UPSTREAM_ADDR ?? 'localhost:19999').replace(/^https?:\/\//, '')
    expect(upstreams[0]?.dial).toBe(expectedDial)
  })
})
