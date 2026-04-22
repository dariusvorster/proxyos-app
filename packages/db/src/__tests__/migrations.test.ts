import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { ensureSchema } from '../migrations'

function makeDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return sqlite
}

describe('ensureSchema — migration integrity', () => {
  it('M1: creates routes table with expected columns', () => {
    const db = makeDb()
    ensureSchema(db)
    const cols = db.pragma('table_info(routes)') as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('domain')
    expect(names).toContain('enabled')
    expect(names).toContain('upstream_type')
    expect(names).toContain('upstreams')
    expect(names).toContain('tls_mode')
    expect(names).toContain('sync_status')   // Fix 4 column
    expect(names).toContain('sync_diff')     // Fix 4 column
    expect(names).toContain('sync_checked_at') // Fix 4 column
    expect(names).toContain('sync_source')   // Fix 4 column
  })

  it('M2: creates users table with expected columns', () => {
    const db = makeDb()
    ensureSchema(db)
    const cols = db.pragma('table_info(users)') as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('email')
    expect(names).toContain('password_hash')
    expect(names).toContain('role')
    expect(names).toContain('created_at')
    expect(names).toContain('last_login')
  })

  it('M3: idempotent — running ensureSchema twice does not corrupt tables', () => {
    const db = makeDb()
    ensureSchema(db)
    // Insert a user row using only columns from the base DDL
    db.prepare(
      `INSERT INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)`
    ).run('u1', 'test@example.com', 'admin', Date.now())
    // Run migrations again — must not throw or corrupt data
    ensureSchema(db)
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get('u1') as { email: string } | undefined
    expect(row?.email).toBe('test@example.com')
  })

  it('M4: routes table has Fix 4 sync columns', () => {
    const db = makeDb()
    ensureSchema(db)
    const cols = db.pragma('table_info(routes)') as Array<{ name: string; dflt_value: string | null }>
    const syncStatus = cols.find(c => c.name === 'sync_status')
    const syncDiff = cols.find(c => c.name === 'sync_diff')
    const syncCheckedAt = cols.find(c => c.name === 'sync_checked_at')
    const syncSource = cols.find(c => c.name === 'sync_source')
    expect(syncStatus).toBeDefined()
    expect(syncDiff).toBeDefined()
    expect(syncCheckedAt).toBeDefined()
    expect(syncSource).toBeDefined()
  })

  it('M5: data inserted into routes survives a second ensureSchema call', () => {
    const db = makeDb()
    ensureSchema(db)
    const now = Date.now()
    db.prepare(`
      INSERT INTO routes (id, name, domain, enabled, upstream_type, upstreams, tls_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('r1', 'Test Route', 'test.example.com', 1, 'http', '["http://localhost:3000"]', 'auto', now, now)
    ensureSchema(db)
    const row = db.prepare('SELECT * FROM routes WHERE id = ?').get('r1') as { domain: string } | undefined
    expect(row?.domain).toBe('test.example.com')
  })

  it('M6: creates additional key tables (audit_log, tenants, users)', () => {
    const db = makeDb()
    ensureSchema(db)
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>)
      .map(t => t.name)
    expect(tables).toContain('audit_log')
    expect(tables).toContain('tenants')
    expect(tables).toContain('users')
    expect(tables).toContain('routes')
    expect(tables).toContain('sso_providers')
    expect(tables).toContain('certificates')
  })

  it('M7: Phase A backfill inserts default tenant, org, and site', () => {
    const db = makeDb()
    ensureSchema(db)
    const tenant = db.prepare(`SELECT id FROM tenants WHERE id = 'tenant_default'`).get()
    const org = db.prepare(`SELECT id FROM organizations WHERE id = 'org_default'`).get()
    const site = db.prepare(`SELECT id FROM sites WHERE id = 'site_local'`).get()
    expect(tenant).toBeDefined()
    expect(org).toBeDefined()
    expect(site).toBeDefined()
  })
})
