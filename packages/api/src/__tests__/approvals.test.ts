import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { eq } from 'drizzle-orm'
import { getDb, users, pendingChanges, nanoid } from '@proxyos/db'
import { CaddyClient } from '@proxyos/caddy'
import { appRouter } from '../root'
import type { Context } from '../trpc'

const TEST_DB_PATH = join(tmpdir(), 'proxyos-approvals-test.db')
const REQUESTER_ID = `requester-${nanoid()}`
const APPROVER_ID = `approver-${nanoid()}`

function makeCtx(userId = APPROVER_ID, role: 'admin' | 'operator' | 'viewer' = 'admin'): Context {
  return {
    req: new Request('http://localhost'),
    db: getDb(),
    caddy: new CaddyClient(),
    session: { userId, role },
    tokenScopes: null,
    resHeaders: new Headers(),
    clientIp: '127.0.0.1',
  }
}

describe('approvals — acceptance', () => {
  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)

    const db = getDb()
    await db.insert(users).values([
      { id: REQUESTER_ID, email: `${REQUESTER_ID}@test.local`, role: 'operator', createdAt: new Date() },
      { id: APPROVER_ID, email: `${APPROVER_ID}@test.local`, role: 'admin', createdAt: new Date() },
    ])
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(pendingChanges).where(eq(pendingChanges.requestedBy, REQUESTER_ID))
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
  })

  test('getConfig returns defaults when no config saved', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const cfg = await caller.approvals.getConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.requiredApprovers).toBe(1)
    expect(cfg.exemptRoles).toContain('admin')
  })

  test('setConfig persists and getConfig round-trips it', async () => {
    const caller = appRouter.createCaller(makeCtx())
    await caller.approvals.setConfig({
      enabled: true,
      requiredApprovers: 2,
      exemptRoles: ['admin'],
      exemptActions: ['route.delete'],
      timeout: 120,
    })
    const cfg = await caller.approvals.getConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.requiredApprovers).toBe(2)
    expect(cfg.timeout).toBe(120)
    expect(cfg.exemptActions).toContain('route.delete')
  })

  test('submit creates a pending change attributed to the requester', async () => {
    const caller = appRouter.createCaller(makeCtx(REQUESTER_ID, 'operator'))
    const { id } = await caller.approvals.submit({
      action: 'route.update',
      payload: { domain: 'test.example.com', field: 'upstream' },
      requestedBy: REQUESTER_ID,
    })
    expect(id).toBeTruthy()

    const db = getDb()
    const row = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id)).get()
    expect(row).toBeDefined()
    expect(row!.status).toBe('pending')
    expect(row!.requestedBy).toBe(REQUESTER_ID)
    expect(row!.approvedBy).toBeNull()
  })

  test('approve sets status=approved and records the approver ID', async () => {
    const requesterCtx = makeCtx(REQUESTER_ID, 'operator')
    const approverCtx = makeCtx(APPROVER_ID, 'admin')

    const { id } = await appRouter.createCaller(requesterCtx).approvals.submit({
      action: 'route.enable',
      payload: { routeId: 'r-001' },
      requestedBy: REQUESTER_ID,
    })

    await appRouter.createCaller(approverCtx).approvals.approve({ id, approvedBy: APPROVER_ID })

    const db = getDb()
    const row = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id)).get()
    expect(row!.status).toBe('approved')
    expect(row!.approvedBy).toBe(APPROVER_ID)
    expect(row!.approvedAt).not.toBeNull()
  })

  test('reject sets status=rejected and records the approver ID', async () => {
    const requesterCtx = makeCtx(REQUESTER_ID, 'operator')
    const approverCtx = makeCtx(APPROVER_ID, 'admin')

    const { id } = await appRouter.createCaller(requesterCtx).approvals.submit({
      action: 'route.disable',
      payload: { routeId: 'r-002' },
      requestedBy: REQUESTER_ID,
    })

    await appRouter.createCaller(approverCtx).approvals.reject({ id, approvedBy: APPROVER_ID })

    const db = getDb()
    const row = await db.select().from(pendingChanges).where(eq(pendingChanges.id, id)).get()
    expect(row!.status).toBe('rejected')
    expect(row!.approvedBy).toBe(APPROVER_ID)
  })

  test('list(pending) only returns pending changes', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const pending = await caller.approvals.list({ status: 'pending' })
    expect(pending.every(c => c.status === 'pending')).toBe(true)
  })

  test('list(all) includes approved and rejected entries', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const all = await caller.approvals.list({ status: 'all' })
    const statuses = new Set(all.map(c => c.status))
    expect(statuses.has('approved')).toBe(true)
    expect(statuses.has('rejected')).toBe(true)
  })

  test('list resolves approvedBy to email when user exists', async () => {
    const caller = appRouter.createCaller(makeCtx())
    const all = await caller.approvals.list({ status: 'all' })
    const approved = all.find(c => c.status === 'approved')
    expect(approved).toBeDefined()
    expect(approved!.approvedBy).toContain('@test.local')
  })

  test('approve by a non-admin user is forbidden', async () => {
    const requesterCtx = makeCtx(REQUESTER_ID, 'operator')
    const { id } = await appRouter.createCaller(requesterCtx).approvals.submit({
      action: 'route.update',
      payload: { domain: 'x.example.com' },
      requestedBy: REQUESTER_ID,
    })

    const viewerCtx = makeCtx(`viewer-${nanoid()}`, 'viewer')
    await expect(
      appRouter.createCaller(viewerCtx).approvals.approve({ id, approvedBy: 'viewer' }),
    ).rejects.toThrow()
  })
})
