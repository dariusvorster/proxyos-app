import { describe, it, expect } from 'vitest'
import { diffCaddyRoute, classifyDrift } from '../verify'
import type { CaddyRoute } from '../types'

function makeCaddyRoute(overrides: Partial<CaddyRoute> = {}): CaddyRoute {
  return {
    '@id': 'proxyos-route-test',
    match: [{ host: ['example.com'] }],
    terminal: true,
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: '10.0.0.1:80' }],
        headers: {
          request: {
            set: {
              Host: ['{http.request.host}'],
              'X-Forwarded-Host': ['{http.request.host}'],
              'X-Forwarded-Proto': ['{http.request.scheme}'],
              'X-Forwarded-For': ['{http.request.remote.host}'],
              'X-Real-IP': ['{http.request.remote.host}'],
              'X-Forwarded-Port': ['{http.request.port}'],
            },
          },
        },
      },
    ],
    ...overrides,
  }
}

describe('diffCaddyRoute', () => {
  it('D1: identical routes produce empty diff', () => {
    const route = makeCaddyRoute()
    expect(diffCaddyRoute(route, route)).toEqual([])
  })

  it('D2: actual missing Host header produces missing diff', () => {
    const expected = makeCaddyRoute()
    const actual = makeCaddyRoute()
    // Remove Host from actual
    const rp = actual.handle[0] as Record<string, unknown>
    const headers = (rp.headers as Record<string, unknown>)
    const request = (headers.request as Record<string, unknown>)
    const set = request.set as Record<string, unknown>
    delete set['Host']
    const diffs = diffCaddyRoute(expected, actual)
    expect(diffs.length).toBeGreaterThanOrEqual(1)
    expect(diffs.some(d => d.kind === 'missing' && d.field.includes('Host'))).toBe(true)
  })

  it('D3: Caddy default expect_status is ignored', () => {
    const expected = makeCaddyRoute()
    const actual = makeCaddyRoute()
    // Add Caddy-injected default to actual
    ;(actual.handle[0] as Record<string, unknown>).health_checks = {
      active: { expect_status: 200 },
    }
    expect(diffCaddyRoute(expected, actual)).toEqual([])
  })

  it('D4: different upstream dial produces changed diff', () => {
    const expected = makeCaddyRoute()
    const actual = makeCaddyRoute()
    ;(actual.handle[0] as Record<string, unknown>).upstreams = [{ dial: '10.0.0.2:80' }]
    const diffs = diffCaddyRoute(expected, actual)
    expect(diffs.length).toBeGreaterThanOrEqual(1)
    expect(diffs.some(d => d.kind === 'changed' && String(d.expected).includes('10.0.0.1') && String(d.actual).includes('10.0.0.2'))).toBe(true)
  })

  it('D5: missing transport block produces missing diff', () => {
    const expected = makeCaddyRoute()
    ;(expected.handle[0] as Record<string, unknown>).transport = { protocol: 'http', tls: { insecure_skip_verify: true } }
    const actual = makeCaddyRoute()
    const diffs = diffCaddyRoute(expected, actual)
    expect(diffs.length).toBeGreaterThanOrEqual(1)
    expect(diffs.some(d => d.kind === 'missing' && d.field.includes('transport'))).toBe(true)
  })

  it('D6: different @id produces changed diff', () => {
    const expected = makeCaddyRoute({ '@id': 'proxyos-route-x' })
    const actual = makeCaddyRoute({ '@id': 'proxyos-route-y' })
    const diffs = diffCaddyRoute(expected, actual)
    expect(diffs.some(d => d.field === '@id' && d.kind === 'changed')).toBe(true)
  })

  it('D7: array length mismatch in handle captures missing handler', () => {
    const expected = makeCaddyRoute()
    expected.handle = [...expected.handle, { handler: 'encode', encodings: { gzip: {} } }]
    const actual = makeCaddyRoute()
    const diffs = diffCaddyRoute(expected, actual)
    expect(diffs.some(d => d.kind === 'missing')).toBe(true)
  })
})

describe('classifyDrift', () => {
  const someDiff = [{ field: 'test', expected: 'a', actual: 'b', kind: 'changed' as const }]

  it('D8: empty diff with manual source returns synced', () => {
    expect(classifyDrift([], 'manual')).toBe('synced')
  })

  it('D9: non-empty diff with manual source returns drift', () => {
    expect(classifyDrift(someDiff, 'manual')).toBe('drift')
  })

  it('D10: non-empty diff with patchos source returns synced-machine', () => {
    expect(classifyDrift(someDiff, 'patchos')).toBe('synced-machine')
  })

  it('D11: non-empty diff with scheduled source returns synced-machine', () => {
    expect(classifyDrift(someDiff, 'scheduled')).toBe('synced-machine')
  })

  it('D12: non-empty diff with null source returns drift (fail-closed)', () => {
    expect(classifyDrift(someDiff, null)).toBe('drift')
  })

  it('D13: non-empty diff with bootstrap source returns drift', () => {
    expect(classifyDrift(someDiff, 'bootstrap')).toBe('drift')
  })

  it('D14: non-empty diff with unknown source returns drift (fail-closed)', () => {
    expect(classifyDrift(someDiff, 'unknown-future-value')).toBe('drift')
  })
})
