import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

// ---------------------------------------------------------------------------
// Mock heavy side-effecting modules BEFORE importing the router under test.
// ---------------------------------------------------------------------------

// resolveEffectiveRole calls getDb() singleton internally — mock the whole module
vi.mock('../rbac', () => ({
  resolveEffectiveRole: vi.fn(),
  canMutate: vi.fn(),
  canRead: vi.fn(),
}))

// Caddy client — avoid real HTTP calls
vi.mock('@proxyos/caddy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@proxyos/caddy')>()
  return {
    ...actual,
    CaddyClient: vi.fn().mockImplementation(() => ({
      addRoute: vi.fn().mockResolvedValue(undefined),
      updateRoute: vi.fn().mockResolvedValue(undefined),
      upsertTlsPolicy: vi.fn().mockResolvedValue(undefined),
      verifyRoute: vi.fn().mockResolvedValue({ diff: [] }),
      health: vi.fn().mockResolvedValue(true),
    })),
  }
})

// Federation dynamic import inside routes.ts — non-fatal in standalone, but
// the dynamic import will fail in test env if not mocked.
vi.mock('@proxyos/federation/server', () => ({
  getFederationServer: vi.fn().mockReturnValue(null),
}))

// ---------------------------------------------------------------------------
// Import DB utilities via @proxyos/db (which owns better-sqlite3 as a dep)
// The test creates an in-memory DB using the db package's own drizzle setup.
// ---------------------------------------------------------------------------
import { getDb, users, routes as routesTable } from '@proxyos/db'
import { routesRouter } from '../routers/routes'
import { type Context } from '../trpc'
import { resolveEffectiveRole, canMutate } from '../rbac'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type TestDb = ReturnType<typeof getDb>

function makeMockCaddy() {
  return {
    addRoute: vi.fn().mockResolvedValue(undefined),
    updateRoute: vi.fn().mockResolvedValue(undefined),
    upsertTlsPolicy: vi.fn().mockResolvedValue(undefined),
    verifyRoute: vi.fn().mockResolvedValue({ diff: [] }),
    health: vi.fn().mockResolvedValue(true),
  }
}

function makeCtx(db: TestDb, overrides: Partial<Omit<Context, 'db'>> = {}): Context {
  return {
    req: new Request('http://localhost'),
    db,
    caddy: (overrides.caddy ?? makeMockCaddy()) as unknown as Context['caddy'],
    session: overrides.session ?? null,
    tokenScopes: null,
    resHeaders: new Headers(),
    clientIp: '127.0.0.1',
  }
}

// Build a tRPC caller for the routes sub-router
const t = initTRPC.context<Context>().create({ transformer: superjson })
const testRouter = t.router({ routes: routesRouter })
const createCaller = testRouter.createCaller

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

const ADMIN_ID = 'user-admin-1'
const VIEWER_ID = 'user-viewer-1'

async function resetDb(db: TestDb) {
  // Truncate mutable tables between tests — getDb() is a singleton over :memory:
  await db.delete(routesTable)
  await db.delete(users)
}

async function seedUsers(db: TestDb) {
  await db.insert(users).values([
    { id: ADMIN_ID, email: 'admin@test.local', role: 'admin', createdAt: new Date() },
    { id: VIEWER_ID, email: 'viewer@test.local', role: 'viewer', createdAt: new Date() },
  ])
}

const validCreateInput = {
  name: 'My Service',
  domain: 'svc.example.com',
  upstreams: [{ address: 'localhost:3000' }],
  lbPolicy: 'round_robin' as const,
  tlsMode: 'auto' as const,
  ssoEnabled: false,
  ssoProviderId: null,
  tlsDnsProviderId: null,
  compressionEnabled: true,
  healthCheckEnabled: true,
  healthCheckPath: '/',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes.create', () => {
  let db: TestDb

  beforeEach(async () => {
    vi.clearAllMocks()
    db = getDb()
    await resetDb(db)
    await seedUsers(db)
  })

  it('happy path: creates a route and returns route with correct domain', async () => {
    vi.mocked(resolveEffectiveRole).mockResolvedValue('super_admin')
    vi.mocked(canMutate).mockReturnValue(true)

    const caller = createCaller(
      makeCtx(db, { session: { userId: ADMIN_ID, role: 'admin' } }),
    )

    const result = await caller.routes.create(validCreateInput)

    expect(result.domain).toBe('svc.example.com')
    expect(result.name).toBe('My Service')
    expect(result.id).toBeTruthy()
    expect(result.enabled).toBe(true)
  })

  it('validation error: empty domain throws BAD_REQUEST', async () => {
    vi.mocked(resolveEffectiveRole).mockResolvedValue('super_admin')
    vi.mocked(canMutate).mockReturnValue(true)

    const caller = createCaller(
      makeCtx(db, { session: { userId: ADMIN_ID, role: 'admin' } }),
    )

    await expect(
      caller.routes.create({ ...validCreateInput, domain: '' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('unauthorized: no session throws UNAUTHORIZED', async () => {
    const caller = createCaller(makeCtx(db, { session: null }))

    await expect(
      caller.routes.create(validCreateInput),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('forbidden: viewer role (canMutate=false) throws FORBIDDEN', async () => {
    vi.mocked(resolveEffectiveRole).mockResolvedValue('org_viewer')
    vi.mocked(canMutate).mockReturnValue(false)

    const caller = createCaller(
      makeCtx(db, { session: { userId: VIEWER_ID, role: 'viewer' } }),
    )

    await expect(
      caller.routes.create(validCreateInput),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('duplicate domain throws CONFLICT', async () => {
    vi.mocked(resolveEffectiveRole).mockResolvedValue('super_admin')
    vi.mocked(canMutate).mockReturnValue(true)

    const caller = createCaller(
      makeCtx(db, { session: { userId: ADMIN_ID, role: 'admin' } }),
    )

    // First create succeeds
    await caller.routes.create(validCreateInput)

    // Second create with same domain should conflict
    await expect(
      caller.routes.create(validCreateInput),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
