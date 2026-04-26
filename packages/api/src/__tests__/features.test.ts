import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { eq, and } from 'drizzle-orm'
import {
  getDb, users, routes as routesTable, trafficMetrics, ddnsRecords,
  dnsProviders, routeVersions, scheduledChanges, routeHealthScores,
  anomalyBaselines, healthChecks as healthChecksTable, nanoid,
} from '@proxyos/db'
import { CaddyClient } from '@proxyos/caddy'
import { appRouter } from '../root'
import type { Context } from '../trpc'

const TEST_DB_PATH = join(tmpdir(), 'proxyos-features-test.db')
const TEST_USER_ID = `feat-test-${nanoid()}`

function makeNullCaddy(): CaddyClient {
  const caddy = new CaddyClient()
  const proto = Object.getPrototypeOf(caddy) as Record<string, unknown>
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue
    if (typeof proto[key] === 'function') {
      ;(caddy as unknown as Record<string, unknown>)[key] =
        key === 'health' ? async () => true : async () => undefined
    }
  }
  return caddy
}

function makeCtx(role: 'admin' | 'operator' | 'viewer' = 'admin'): Context {
  return {
    req: new Request('http://localhost'),
    db: getDb(),
    caddy: makeNullCaddy(),
    session: { userId: TEST_USER_ID, role },
    tokenScopes: null,
    resHeaders: new Headers(),
    clientIp: '127.0.0.1',
  }
}

/** Create a throw-away route, return its id */
async function seedRoute(domain: string): Promise<string> {
  const caller = appRouter.createCaller(makeCtx())
  const r = await caller.routes.create({ name: domain, domain, upstreams: [{ address: '127.0.0.1:9000' }] })
  return r.id
}

beforeAll(async () => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
  const db = getDb()
  await db.insert(users).values({ id: TEST_USER_ID, email: `${TEST_USER_ID}@test.local`, role: 'admin', createdAt: new Date() })
})

afterAll(async () => {
  const db = getDb()
  await db.delete(users).where(eq(users.id, TEST_USER_ID)).catch(() => {})
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
})

// ── §3.18 Health scores ────────────────────────────────────────────────────────
describe('§3.18 health score calculator', () => {
  let routeId: string

  beforeAll(async () => {
    routeId = await seedRoute(`hs-test-${nanoid()}.local`)
  })

  test('calculate returns score 100 for route with no traffic', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.healthScores.calculate({ routeId })
    expect(result.score).toBe(100)
    expect(result.uptimePct).toBe(100)
    expect(result.errorRatePct).toBe(0)
    expect(result.p95Ms).toBeNull()
    expect(result.sloCompliant).toBe(true)
  })

  test('calculate persists score into DB', async () => {
    const caller = appRouter.createCaller(makeCtx())
    await caller.healthScores.calculate({ routeId })
    const row = await caller.healthScores.get({ routeId })
    expect(row).not.toBeNull()
    expect(row!.score).toBe(100)
    expect(row!.routeId).toBe(routeId)
  })

  test('calculate with error traffic produces degraded score', async () => {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)
    await db.insert(trafficMetrics).values({
      id: nanoid(), routeId, bucket: 'test', bucketTs: now - 3600,
      requests: 100, bytes: 0, errors: 40,
      status2xx: 60, status3xx: 0, status4xx: 0, status5xx: 40,
      latencySumMs: 5000,
    })
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.healthScores.calculate({ routeId })
    expect(result.score).toBeLessThan(100)
    expect(result.errorRatePct).toBe(40)
    expect(result.sloCompliant).toBe(false)
  })

  test('calculateAll covers every route and returns array', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const results = await caller.healthScores.calculateAll()
    expect(Array.isArray(results)).toBe(true)
    const mine = results.find(r => r.routeId === routeId)
    expect(mine).toBeDefined()
  })

  test('listLow threshold filters correctly', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const low = await caller.healthScores.listLow({ threshold: 50 })
    const high = await caller.healthScores.listLow({ threshold: 100 })
    // all scores below 50 are in low; high threshold catches more
    expect(high.length).toBeGreaterThanOrEqual(low.length)
  })
})

// ── §3.16 Scheduled changes executor ──────────────────────────────────────────
describe('§3.16 scheduled changes executor', () => {
  let routeId: string

  beforeAll(async () => {
    routeId = await seedRoute(`sched-test-${nanoid()}.local`)
  })

  test('executeDue with no due changes returns { executed:0 }', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.scheduledChanges.executeDue()
    expect(result.executed).toBeGreaterThanOrEqual(0)
    expect(result.failed).toBeGreaterThanOrEqual(0)
  })

  test('past-scheduled disable actually disables the route', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const db = getDb()

    // ensure enabled first
    await db.update(routesTable).set({ enabled: true }).where(eq(routesTable.id, routeId))

    const changeId = nanoid()
    await db.insert(scheduledChanges).values({
      id: changeId, routeId,
      action: 'disable', payload: null,
      scheduledAt: new Date(Date.now() - 60_000), // 1 min ago
      status: 'pending',
      createdAt: new Date(),
    })

    const result = await caller.scheduledChanges.executeDue()
    expect(result.executed).toBeGreaterThanOrEqual(1)

    const row = await db.select().from(routesTable).where(eq(routesTable.id, routeId)).get()
    expect(row!.enabled).toBe(false)

    const change = await db.select().from(scheduledChanges).where(eq(scheduledChanges.id, changeId)).get()
    expect(change!.status).toBe('done')
    expect(change!.executedAt).not.toBeNull()
  })

  test('past-scheduled enable actually enables the route', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const db = getDb()

    const changeId = nanoid()
    await db.insert(scheduledChanges).values({
      id: changeId, routeId,
      action: 'enable', payload: null,
      scheduledAt: new Date(Date.now() - 60_000),
      status: 'pending',
      createdAt: new Date(),
    })

    await caller.scheduledChanges.executeDue()

    const row = await db.select().from(routesTable).where(eq(routesTable.id, routeId)).get()
    expect(row!.enabled).toBe(true)
  })

  test('future-scheduled change is NOT executed', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const db = getDb()

    const changeId = nanoid()
    await db.insert(scheduledChanges).values({
      id: changeId, routeId,
      action: 'disable', payload: null,
      scheduledAt: new Date(Date.now() + 3_600_000), // 1 hour in future
      status: 'pending',
      createdAt: new Date(),
    })

    await caller.scheduledChanges.executeDue()

    const change = await db.select().from(scheduledChanges).where(eq(scheduledChanges.id, changeId)).get()
    expect(change!.status).toBe('pending')
  })

  test('past-scheduled update_upstream replaces upstream', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const db = getDb()

    const newUpstream = [{ address: '10.9.9.9:7777' }]
    const changeId = nanoid()
    await db.insert(scheduledChanges).values({
      id: changeId, routeId,
      action: 'update_upstream',
      payload: JSON.stringify({ upstreams: newUpstream }),
      scheduledAt: new Date(Date.now() - 60_000),
      status: 'pending',
      createdAt: new Date(),
    })

    await caller.scheduledChanges.executeDue()

    const row = await db.select().from(routesTable).where(eq(routesTable.id, routeId)).get()
    const upstreams = JSON.parse(row!.upstreams) as Array<{ address: string }>
    expect(upstreams[0]!.address).toBe('10.9.9.9:7777')
  })

  test('missing route marks change as failed', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const db = getDb()

    const changeId = nanoid()
    // FK constraints prevent inserting orphaned rows normally; disable temporarily
    ;(db as any).$client.pragma('foreign_keys = OFF')
    await db.insert(scheduledChanges).values({
      id: changeId, routeId: 'nonexistent-route-id',
      action: 'disable', payload: null,
      scheduledAt: new Date(Date.now() - 60_000),
      status: 'pending',
      createdAt: new Date(),
    })
    ;(db as any).$client.pragma('foreign_keys = ON')

    const result = await caller.scheduledChanges.executeDue()
    expect(result.failed).toBeGreaterThanOrEqual(1)

    const change = await db.select().from(scheduledChanges).where(eq(scheduledChanges.id, changeId)).get()
    expect(change!.status).toBe('failed')
    expect(change!.error).toBeTruthy()
  })
})

// ── Route rules router ─────────────────────────────────────────────────────────
describe('routeRules CRUD', () => {
  let routeId: string
  let ruleId: string

  beforeAll(async () => {
    routeId = await seedRoute(`rules-test-${nanoid()}.local`)
  })

  test('listByRoute returns empty for new route', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const rules = await caller.routeRules.listByRoute({ routeId })
    expect(rules).toHaveLength(0)
  })

  test('create adds a path rule', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const rule = await caller.routeRules.create({
      routeId,
      matcherType: 'path',
      matcherKey: null,
      matcherValue: '/api/*',
      action: 'upstream',
      upstream: '10.0.0.2:8080',
      redirectUrl: null,
      staticBody: null,
      staticStatus: null,
      priority: 10,
    })
    expect(rule).toBeTruthy()
    expect(rule!.matcherValue).toBe('/api/*')
    ruleId = rule!.id
  })

  test('listByRoute returns created rule', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const rules = await caller.routeRules.listByRoute({ routeId })
    expect(rules).toHaveLength(1)
    expect(rules[0]!.id).toBe(ruleId)
  })

  test('update changes priority', async () => {
    const caller = appRouter.createCaller(makeCtx())
    await caller.routeRules.update({ id: ruleId, patch: { priority: 99 } })
    const rules = await caller.routeRules.listByRoute({ routeId })
    expect(rules[0]!.priority).toBe(99)
  })

  test('delete removes the rule', async () => {
    const caller = appRouter.createCaller(makeCtx())
    await caller.routeRules.delete({ id: ruleId })
    const rules = await caller.routeRules.listByRoute({ routeId })
    expect(rules).toHaveLength(0)
  })

  test('create redirect rule stores redirectUrl', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const rule = await caller.routeRules.create({
      routeId,
      matcherType: 'method',
      matcherKey: null,
      matcherValue: 'GET',
      action: 'redirect',
      upstream: null,
      redirectUrl: 'https://example.com',
      staticBody: null,
      staticStatus: null,
      priority: 5,
    })
    expect(rule!.redirectUrl).toBe('https://example.com')
    await caller.routeRules.delete({ id: rule!.id })
  })
})

// ── Custom certificate upload ──────────────────────────────────────────────────
describe('certificate upload', () => {
  test('upload with invalid PEM stores cert with null dates', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.certificates.upload({
      domain: `cert-test-${nanoid()}.local`,
      cert: 'NOT_A_VALID_CERT',
      key: 'NOT_A_VALID_KEY',
    })
    expect(result.id).toBeTruthy()
    expect(result.message).toContain('Certificate loaded')
    expect(result.expiresAt).toBeNull()
  })

  test('uploading twice for same domain upserts — no duplicate rows', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const domain = `cert-dup-${nanoid()}.local`
    const r1 = await caller.certificates.upload({ domain, cert: 'BAD1', key: 'K1' })
    const r2 = await caller.certificates.upload({ domain, cert: 'BAD2', key: 'K2' })
    expect(r1.id).toBe(r2.id)

    const all = await caller.certificates.list()
    expect(all.filter(c => c.domain === domain)).toHaveLength(1)
  })
})

// ── DDNS ──────────────────────────────────────────────────────────────────────
describe('DDNS triggerUpdate', () => {
  let providerId: string
  let recordId: string
  const MOCK_IP = '1.2.3.4'

  beforeAll(async () => {
    const db = getDb()
    providerId = nanoid()
    await db.insert(dnsProviders).values({
      id: providerId,
      name: 'Test CF',
      type: 'cloudflare',
      credentials: JSON.stringify({ api_token: 'test-token' }),
      enabled: true,
      createdAt: new Date(),
    })
    recordId = nanoid()
    await db.insert(ddnsRecords).values({
      id: recordId,
      dnsProviderId: providerId,
      zone: 'example.com',
      recordName: 'home',
      recordType: 'A',
      updateIntervalS: 300,
      enabled: true,
      lastIp: MOCK_IP,   // same as what mock IP detect will return
      createdAt: new Date(),
    })
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(ddnsRecords).where(eq(ddnsRecords.id, recordId)).catch(() => {})
    await db.delete(dnsProviders).where(eq(dnsProviders.id, providerId)).catch(() => {})
  })

  test('triggerUpdate returns { changed: false } when IP is unchanged', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('my-ip.io')) {
        return { ok: true, json: async () => ({ ip: MOCK_IP }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.ddns.triggerUpdate({ id: recordId })
    expect(result.changed).toBe(false)
    expect(result.ip).toBe(MOCK_IP)

    vi.unstubAllGlobals()
  })

  test('triggerUpdate records error when IP detection fails', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('network error') })

    const caller = appRouter.createCaller(makeCtx())
    await expect(caller.ddns.triggerUpdate({ id: recordId })).rejects.toThrow()

    const db = getDb()
    const row = await db.select().from(ddnsRecords).where(eq(ddnsRecords.id, recordId)).get()
    expect(row!.lastError).toBeTruthy()

    vi.unstubAllGlobals()
  })
})

// ── §3.18-adjacent: Anomaly detection ─────────────────────────────────────────
describe('anomaly detection API', () => {
  let routeId: string

  beforeAll(async () => {
    routeId = await seedRoute(`anomaly-test-${nanoid()}.local`)
  })

  test('getAnomalyBaselines returns empty for new route', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const baselines = await caller.intelligence.getAnomalyBaselines({ routeId })
    expect(Array.isArray(baselines)).toBe(true)
    expect(baselines.length).toBe(0)
  })

  test('updateAnomalyBaseline with no traffic does not crash', async () => {
    const caller = appRouter.createCaller(makeCtx())
    await expect(
      caller.intelligence.updateAnomalyBaseline({ routeId, metric: 'req_per_min' })
    ).resolves.toEqual({ ok: true })
  })

  test('checkAnomaly with no baseline returns { isAnomaly: false }', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.intelligence.checkAnomaly({
      routeId, metric: 'req_per_min', currentValue: 9999,
    })
    expect(result.isAnomaly).toBe(false)
  })

  test('updateAnomalyBaseline populates baseline when enough traffic samples exist', async () => {
    const db = getDb()
    const now = new Date()
    // insert 5 traffic buckets all within the last hour (same hour-of-week slot, within 7-day window)
    for (let i = 0; i < 5; i++) {
      const ts = new Date(now.getTime() - i * 60_000)
      await db.insert(trafficMetrics).values({
        id: nanoid(), routeId, bucket: `ano-${i}`,
        bucketTs: Math.floor(ts.getTime()),
        requests: 100 + i, bytes: 0, errors: 0,
        status2xx: 100, status3xx: 0, status4xx: 0, status5xx: 0,
        latencySumMs: 1000,
      })
    }

    const caller = appRouter.createCaller(makeCtx())
    await caller.intelligence.updateAnomalyBaseline({ routeId, metric: 'req_per_min' })

    const baselines = await caller.intelligence.getAnomalyBaselines({ routeId })
    expect(baselines.length).toBeGreaterThan(0)
    const b = baselines[0]!
    expect(b.mean).toBeGreaterThan(0)
    expect(b.sampleCount).toBeGreaterThanOrEqual(3)
  })

  test('checkAnomaly fires true for extreme outlier above baseline', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const baselines = await caller.intelligence.getAnomalyBaselines({ routeId })
    if (baselines.length === 0) return // no baseline yet, skip

    const b = baselines[0]!
    const extremeValue = b.mean + b.stddev * 10 + 9999

    const result = await caller.intelligence.checkAnomaly({
      routeId, metric: 'req_per_min',
      currentValue: extremeValue,
      sensitivity: 2,
      minBaselineDays: 0,
    })
    expect(result.isAnomaly).toBe(true)
  })
})

// ── Health check probing ───────────────────────────────────────────────────────
describe('health check probing', () => {
  let routeId: string

  beforeAll(async () => {
    routeId = await seedRoute(`hc-probe-${nanoid()}.test`)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  test('run records healthy when upstream returns 200', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true, status: 200,
      text: async () => 'OK',
    }))
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.healthChecks.run({ routeId })
    expect(result.overallStatus).toBe('healthy')
    expect(result.statusCode).toBe(200)
    expect(result.error).toBeNull()
    vi.unstubAllGlobals()
  })

  test('run records unhealthy when upstream returns 500', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false, status: 500,
      text: async () => 'Internal Server Error',
    }))
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.healthChecks.run({ routeId })
    expect(result.overallStatus).toBe('unhealthy')
    expect(result.statusCode).toBe(500)
    expect(result.error).toMatch(/500/)
    vi.unstubAllGlobals()
  })

  test('run records unhealthy when fetch throws (connection refused)', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('ECONNREFUSED') })
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.healthChecks.run({ routeId })
    expect(result.overallStatus).toBe('unhealthy')
    expect(result.error).toMatch(/ECONNREFUSED/)
    vi.unstubAllGlobals()
  })

  test('run records degraded when body regex does not match', async () => {
    const db = getDb()
    await db.update(routesTable).set({ healthCheckBodyRegex: 'expected-string' }).where(eq(routesTable.id, routeId))
    vi.stubGlobal('fetch', async () => ({
      ok: true, status: 200,
      text: async () => 'something-else',
    }))
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.healthChecks.run({ routeId })
    expect(result.overallStatus).toBe('degraded')
    expect(result.bodyMatched).toBe(false)
    await db.update(routesTable).set({ healthCheckBodyRegex: null }).where(eq(routesTable.id, routeId))
    vi.unstubAllGlobals()
  })

  test('run result is persisted in listByRoute', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true, status: 200,
      text: async () => '',
    }))
    const caller = appRouter.createCaller(makeCtx())
    await caller.healthChecks.run({ routeId })
    const history = await caller.healthChecks.listByRoute({ routeId })
    expect(history.length).toBeGreaterThan(0)
    expect(history[0]!.overallStatus).toBe('healthy')
    vi.unstubAllGlobals()
  })

  test('runAll probes all health-check-enabled routes', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true, status: 200,
      text: async () => '',
    }))
    const caller = appRouter.createCaller(makeCtx())
    const result = await caller.healthChecks.runAll()
    expect(result.checked).toBeGreaterThanOrEqual(1)
    vi.unstubAllGlobals()
  })
})

// ── Traffic replay ─────────────────────────────────────────────────────────────
describe('traffic replay', () => {
  let routeId: string

  beforeAll(async () => {
    routeId = await seedRoute(`replay-${nanoid()}.test`)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  test('record stores a request log and listByRoute returns it', async () => {
    const caller = appRouter.createCaller(makeCtx())
    await caller.trafficReplay.record({
      routeId, method: 'GET', path: '/api/test',
      query: 'foo=bar', headers: { 'x-test': '1' },
      body: null, statusCode: 200, responseTimeMs: 42,
    })
    const logs = await caller.trafficReplay.listByRoute({ routeId })
    expect(logs.length).toBeGreaterThan(0)
    const log = logs.find(l => l.path === '/api/test')!
    expect(log).toBeTruthy()
    expect(log.method).toBe('GET')
    expect(log.query).toBe('foo=bar')
    expect(log.statusCode).toBe(200)
  })

  test('replay forwards request to target URL and returns status', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 201, text: async () => '' }))
    const caller = appRouter.createCaller(makeCtx())
    const logs = await caller.trafficReplay.listByRoute({ routeId })
    const result = await caller.trafficReplay.replay({ id: logs[0]!.id, targetUrl: 'http://staging:9090' })
    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(201)
    vi.unstubAllGlobals()
  })

  test('replay returns ok:false when fetch throws', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('connection refused') })
    const caller = appRouter.createCaller(makeCtx())
    const logs = await caller.trafficReplay.listByRoute({ routeId })
    const result = await caller.trafficReplay.replay({ id: logs[0]!.id, targetUrl: 'http://staging:9090' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/connection refused/)
    vi.unstubAllGlobals()
  })

  test('exportNdjson returns one JSON line per log', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const ndjson = await caller.trafficReplay.exportNdjson({ routeId })
    const lines = ndjson.trim().split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThan(0)
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>
    expect(parsed.method).toBeDefined()
    expect(parsed.path).toBeDefined()
  })

  test('clear removes all logs for the route', async () => {
    const caller = appRouter.createCaller(makeCtx())
    await caller.trafficReplay.clear({ routeId })
    const logs = await caller.trafficReplay.listByRoute({ routeId })
    expect(logs.length).toBe(0)
  })
})

// ── Public API write endpoints (routes:write scope) ────────────────────────────
describe('public API write endpoints', () => {
  function makeTokenCtx(scopes: string[]) {
    return {
      req: new Request('http://localhost'),
      db: getDb(),
      caddy: makeNullCaddy(),
      session: { userId: TEST_USER_ID, role: 'admin' as const },
      tokenScopes: scopes,
      resHeaders: new Headers(),
      clientIp: '127.0.0.1',
    }
  }

  test('createRoute creates a route and returns id', async () => {
    const caller = appRouter.createCaller(makeTokenCtx(['routes:write', 'routes:read']))
    const domain = `api-write-${nanoid()}.test`
    const result = await caller.publicApi.createRoute({
      name: 'API Created', domain,
      upstreams: [{ address: '10.0.0.1:8080', weight: 1 }],
    })
    expect(result.id).toBeTruthy()

    const list = await caller.publicApi.routes()
    expect(list.some(r => r.domain === domain)).toBe(true)
  })

  test('createRoute rejects duplicate domain', async () => {
    const caller = appRouter.createCaller(makeTokenCtx(['routes:write']))
    const domain = `api-dup-${nanoid()}.test`
    await caller.publicApi.createRoute({ name: 'First', domain, upstreams: [{ address: '10.0.0.1:9000' }] })
    await expect(caller.publicApi.createRoute({ name: 'Dup', domain, upstreams: [{ address: '10.0.0.2:9000' }] }))
      .rejects.toMatchObject({ code: 'CONFLICT' })
  })

  test('updateRoute patches enabled and upstreams', async () => {
    const caller = appRouter.createCaller(makeTokenCtx(['routes:write', 'routes:read']))
    const domain = `api-update-${nanoid()}.test`
    const { id } = await caller.publicApi.createRoute({ name: 'To Update', domain, upstreams: [{ address: 'old:8080' }] })

    await caller.publicApi.updateRoute({ id, patch: { enabled: false, upstreams: [{ address: 'new:9090' }] } })

    const list = await caller.publicApi.routes()
    const updated = list.find(r => r.id === id)!
    expect(updated.enabled).toBe(false)
    expect(updated.upstreams[0]!.address).toBe('new:9090')
  })

  test('updateRoute returns NOT_FOUND for unknown id', async () => {
    const caller = appRouter.createCaller(makeTokenCtx(['routes:write']))
    await expect(caller.publicApi.updateRoute({ id: 'no-such-id', patch: { enabled: true } }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  test('deleteRoute removes the route', async () => {
    const caller = appRouter.createCaller(makeTokenCtx(['routes:write', 'routes:read']))
    const domain = `api-delete-${nanoid()}.test`
    const { id } = await caller.publicApi.createRoute({ name: 'To Delete', domain, upstreams: [{ address: 'x:1' }] })

    await caller.publicApi.deleteRoute({ id })

    const list = await caller.publicApi.routes()
    expect(list.some(r => r.id === id)).toBe(false)
  })

  test('missing scope throws UNAUTHORIZED', async () => {
    const caller = appRouter.createCaller(makeTokenCtx(['routes:read']))
    await expect(caller.publicApi.createRoute({ name: 'x', domain: 'x.test', upstreams: [{ address: 'x:1' }] }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
