import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { eq } from 'drizzle-orm'
import { getDb, users, nanoid } from '@proxyos/db'
import { CaddyClient } from '@proxyos/caddy'
import { appRouter } from '../root'
import type { Context } from '../trpc'

const TEST_DB_PATH = join(tmpdir(), 'proxyos-api-test.db')
const TEST_USER_ID = `test-3f-${nanoid()}`

type ReverseProxyHandler = {
  upstreams?: Array<{ dial: string }>
  transport?: { tls?: unknown }
}

function makeCtx(): Context {
  const db = getDb()
  return {
    req: new Request('http://localhost'),
    db,
    caddy: new CaddyClient(),
    session: { userId: TEST_USER_ID, role: 'admin' },
    tokenScopes: null,
    resHeaders: new Headers(),
    clientIp: '127.0.0.1',
  }
}

async function caddyReachable(): Promise<boolean> {
  return new CaddyClient().health().catch(() => false)
}

describe('3F — upstream URL change persists through save cycle', () => {
  let routeId: string | null = null
  let skipCaddy = false

  beforeAll(async () => {
    // Clean slate: remove stale test DB from previous runs
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)

    // Initialize schema by touching getDb(), then seed test admin user
    const db = getDb()
    await db.insert(users).values({
      id: TEST_USER_ID,
      email: `${TEST_USER_ID}@test.local`,
      role: 'admin',
      createdAt: new Date(),
    })

    skipCaddy = !(await caddyReachable())
    if (skipCaddy) {
      console.warn('[3F] Caddy not reachable — Caddy assertions will be skipped')
    }
  })

  afterAll(async () => {
    if (routeId) {
      const ctx = makeCtx()
      await appRouter.createCaller(ctx).routes.delete({ id: routeId }).catch(() => {})
    }
    const db = getDb()
    await db.delete(users).where(eq(users.id, TEST_USER_ID)).catch(() => {})
  })

  test('upstream URL change persists through save cycle', async () => {
    const ctx = makeCtx()
    const caller = appRouter.createCaller(ctx)

    // Create route with initial upstream
    const route = await caller.routes.create({
      name: 'Test Route 3F',
      domain: `test-3f-${Date.now()}.test.local`,
      upstreams: [{ address: '10.0.0.1:8080' }],
    })
    routeId = route.id

    // Update upstream to HTTPS address
    await caller.routes.update({
      id: route.id,
      patch: { upstreams: [{ address: 'https://10.0.0.2:8443' }] },
    })

    // Fetch fresh from DB — must reflect the new upstream, not the old one
    const updated = await caller.routes.get({ id: route.id })
    expect(updated.upstreams[0]!.address).toBe('https://10.0.0.2:8443')

    if (skipCaddy) return

    // Verify Caddy received the correct dial address and TLS transport
    const caddyRoute = await ctx.caddy.getRoute(route.id)
    const handler = caddyRoute.handle[0]! as ReverseProxyHandler
    expect(handler.upstreams![0]!.dial).toBe('10.0.0.2:8443')
    expect(handler.transport?.tls).toBeDefined()
  })
})
