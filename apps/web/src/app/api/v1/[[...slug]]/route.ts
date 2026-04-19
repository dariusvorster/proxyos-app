import { getDb, agents, certificates, connections, routes, trafficMetrics, nanoid } from '@proxyos/db'
import { eq, gte, and } from 'drizzle-orm'
import { resolveApiKey } from '@proxyos/api/apikeys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Scope = 'read' | 'routes' | 'agents' | 'connections' | 'admin'

const HOSTNAME_RE = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
const VALID_TLS_MODES = ['auto', 'off', 'manual', 'internal'] as const
type TlsMode = typeof VALID_TLS_MODES[number]

function isValidDomain(domain: string): boolean {
  return HOSTNAME_RE.test(domain) && domain.length <= 253
}

function isValidTlsMode(mode: unknown): mode is TlsMode {
  return typeof mode === 'string' && (VALID_TLS_MODES as readonly string[]).includes(mode)
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function err(msg: string, status: number) {
  return json({ error: msg }, status)
}

async function auth(req: Request, db: ReturnType<typeof getDb>, required: Scope): Promise<{ scopes: string[] } | Response> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return err('Missing Authorization header', 401)
  const key = await resolveApiKey(db, token)
  if (!key) return err('Invalid or expired API key', 401)
  const hasScope = key.scopes.includes('admin') || key.scopes.includes(required) || (required === 'read' && key.scopes.length > 0)
  if (!hasScope) return err(`Insufficient scope — requires "${required}" or "admin"`, 403)
  return key
}

export async function GET(req: Request, { params }: { params: Promise<{ slug?: string[] }> }): Promise<Response> {
  const { slug = [] } = await params
  const db = getDb()
  const path = '/' + slug.join('/')

  // Routes
  if (path === '/routes') {
    const result = await auth(req, db, 'read')
    if (result instanceof Response) return result
    const rows = await db.select().from(routes).all()
    return json(rows.map(r => ({ id: r.id, name: r.name, domain: r.domain, enabled: r.enabled, upstreamType: r.upstreamType, upstreams: JSON.parse(r.upstreams), tlsMode: r.tlsMode, createdAt: r.createdAt, updatedAt: r.updatedAt })))
  }

  if (path.match(/^\/routes\/[^/]+$/) && !path.endsWith('/expose') && !path.endsWith('/disable')) {
    const result = await auth(req, db, 'read')
    if (result instanceof Response) return result
    const id = slug[1]!
    const row = await db.select().from(routes).where(eq(routes.id, id)).get()
    if (!row) return err('Route not found', 404)
    return json({ id: row.id, name: row.name, domain: row.domain, enabled: row.enabled, upstreamType: row.upstreamType, upstreams: JSON.parse(row.upstreams), tlsMode: row.tlsMode, createdAt: row.createdAt, updatedAt: row.updatedAt })
  }

  // Agents
  if (path === '/agents') {
    const result = await auth(req, db, 'read')
    if (result instanceof Response) return result
    const rows = await db.select().from(agents).all()
    return json(rows.map(a => ({ id: a.id, name: a.name, siteTag: a.siteTag, status: a.status, routeCount: a.routeCount, certCount: a.certCount, lastSeen: a.lastSeen, createdAt: a.createdAt })))
  }

  if (path.match(/^\/agents\/[^/]+$/) && !path.endsWith('/metrics')) {
    const result = await auth(req, db, 'read')
    if (result instanceof Response) return result
    const id = slug[1]!
    const row = await db.select().from(agents).where(eq(agents.id, id)).get()
    if (!row) return err('Agent not found', 404)
    return json({ id: row.id, name: row.name, siteTag: row.siteTag, status: row.status, routeCount: row.routeCount, certCount: row.certCount, lastSeen: row.lastSeen })
  }

  // Certificates
  if (path === '/certificates') {
    const result = await auth(req, db, 'read')
    if (result instanceof Response) return result
    const rows = await db.select().from(certificates).all()
    return json(rows.map(c => ({ id: c.id, domain: c.domain, source: c.source, status: c.status, expiresAt: c.expiresAt, autoRenew: c.autoRenew })))
  }

  // Connections
  if (path === '/connections') {
    const result = await auth(req, db, 'connections')
    if (result instanceof Response) return result
    const rows = await db.select().from(connections).all()
    return json(rows.map(c => ({ id: c.id, name: c.name, type: c.type, status: c.status, lastSync: c.lastSync, lastError: c.lastError })))
  }

  if (path.match(/^\/connections\/[^/]+\/status$/)) {
    const result = await auth(req, db, 'connections')
    if (result instanceof Response) return result
    const id = slug[1]!
    const row = await db.select().from(connections).where(eq(connections.id, id)).get()
    if (!row) return err('Connection not found', 404)
    return json({ id: row.id, status: row.status, lastSync: row.lastSync, lastError: row.lastError })
  }

  // Analytics
  if (path === '/analytics/summary') {
    const result = await auth(req, db, 'read')
    if (result instanceof Response) return result
    const since = Date.now() - 60 * 60_000
    const rows = await db.select().from(trafficMetrics).where(gte(trafficMetrics.bucketTs, since)).all()
    const totals = rows.reduce((a, r) => ({
      requests: a.requests + r.requests,
      errors: a.errors + r.status5xx,
      bytes: a.bytes + r.bytes,
    }), { requests: 0, errors: 0, bytes: 0 })
    return json({ window: '1h', ...totals })
  }

  if (path.match(/^\/analytics\/routes\/[^/]+$/)) {
    const result = await auth(req, db, 'read')
    if (result instanceof Response) return result
    const routeId = slug[2]!
    const since = Date.now() - 60 * 60_000
    const rows = await db.select().from(trafficMetrics).where(and(eq(trafficMetrics.routeId, routeId), gte(trafficMetrics.bucketTs, since))).all()
    const agg = rows.reduce((a, r) => ({ requests: a.requests + r.requests, errors: a.errors + r.status5xx, latencySum: a.latencySum + r.latencySumMs }), { requests: 0, errors: 0, latencySum: 0 })
    return json({ routeId, window: '1h', ...agg, avgLatencyMs: agg.requests > 0 ? Math.round(agg.latencySum / agg.requests) : 0 })
  }

  return err('Not found', 404)
}

export async function POST(req: Request, { params }: { params: Promise<{ slug?: string[] }> }): Promise<Response> {
  const { slug = [] } = await params
  const db = getDb()
  const path = '/' + slug.join('/')

  if (path === '/routes') {
    const result = await auth(req, db, 'routes')
    if (result instanceof Response) return result
    let body: Record<string, unknown>
    try { body = await req.json() as Record<string, unknown> } catch { return err('Invalid JSON body', 400) }
    if (!body.domain || !body.upstreams) return err('domain and upstreams are required', 400)
    if (!isValidDomain(String(body.domain))) return err('domain must be a valid hostname', 400)
    if (!Array.isArray(body.upstreams) || body.upstreams.length === 0) return err('upstreams must be a non-empty array', 400)
    if (body.tlsMode !== undefined && !isValidTlsMode(body.tlsMode)) return err(`tlsMode must be one of: ${VALID_TLS_MODES.join(', ')}`, 400)
    const id = nanoid()
    const now = new Date()
    await db.insert(routes).values({
      id,
      name: (body.name as string | undefined) ?? String(body.domain),
      domain: String(body.domain),
      enabled: true,
      upstreamType: (body.upstreamType as string | undefined) ?? 'http',
      upstreams: JSON.stringify(body.upstreams),
      lbPolicy: (body.lbPolicy as string | undefined) ?? 'round_robin',
      tlsMode: (body.tlsMode as string | undefined) ?? 'auto',
      createdAt: now,
      updatedAt: now,
    })
    return json({ id, domain: body.domain, enabled: true }, 201)
  }

  if (path.match(/^\/routes\/[^/]+\/expose$/)) {
    const result = await auth(req, db, 'routes')
    if (result instanceof Response) return result
    const id = slug[1]!
    await db.update(routes).set({ enabled: true, updatedAt: new Date() }).where(eq(routes.id, id))
    return json({ ok: true })
  }

  if (path.match(/^\/routes\/[^/]+\/disable$/)) {
    const result = await auth(req, db, 'routes')
    if (result instanceof Response) return result
    const id = slug[1]!
    const now = new Date()
    await db.update(routes).set({ enabled: false, updatedAt: now }).where(eq(routes.id, id))
    return json({ ok: true })
  }

  if (path.match(/^\/certificates\/[^/]+\/renew$/)) {
    const result = await auth(req, db, 'admin')
    if (result instanceof Response) return result
    // Trigger Caddy reload — actual cert renewal is handled by Caddy
    const caddyUrl = process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019'
    try {
      await fetch(`${caddyUrl}/load`, { method: 'POST' })
      return json({ ok: true, message: 'Caddy reload triggered' })
    } catch (e) {
      return err(`Caddy unreachable: ${(e as Error).message}`, 502)
    }
  }

  if (path.match(/^\/connections\/[^/]+\/sync$/)) {
    const result = await auth(req, db, 'connections')
    if (result instanceof Response) return result
    // Sync is handled by the connect adapter — return accepted
    return json({ ok: true, message: 'Sync enqueued' }, 202)
  }

  if (path === '/scanner/scan') {
    const result = await auth(req, db, 'admin')
    if (result instanceof Response) return result
    return json({ ok: true, message: 'Scan enqueued' }, 202)
  }

  return err('Not found', 404)
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug?: string[] }> }): Promise<Response> {
  const { slug = [] } = await params
  const db = getDb()
  const path = '/' + slug.join('/')

  if (path.match(/^\/routes\/[^/]+$/)) {
    const result = await auth(req, db, 'routes')
    if (result instanceof Response) return result
    const id = slug[1]!
    let body: Record<string, unknown>
    try { body = await req.json() as Record<string, unknown> } catch { return err('Invalid JSON body', 400) }
    const now = new Date()
    const updates: Partial<typeof routes.$inferInsert> = { updatedAt: now }
    if (typeof body.name === 'string') updates.name = body.name
    if (typeof body.enabled === 'boolean') updates.enabled = body.enabled
    if (typeof body.upstreams !== 'undefined') updates.upstreams = JSON.stringify(body.upstreams)
    if (body.tlsMode !== undefined) {
      if (!isValidTlsMode(body.tlsMode)) return err(`tlsMode must be one of: ${VALID_TLS_MODES.join(', ')}`, 400)
      updates.tlsMode = body.tlsMode
    }
    await db.update(routes).set(updates).where(eq(routes.id, id))
    const row = await db.select().from(routes).where(eq(routes.id, id)).get()
    if (!row) return err('Route not found', 404)
    return json({ id: row.id, name: row.name, domain: row.domain, enabled: row.enabled, updatedAt: row.updatedAt })
  }

  return err('Not found', 404)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug?: string[] }> }): Promise<Response> {
  const { slug = [] } = await params
  const db = getDb()
  const path = '/' + slug.join('/')

  if (path.match(/^\/routes\/[^/]+$/)) {
    const result = await auth(req, db, 'routes')
    if (result instanceof Response) return result
    const id = slug[1]!
    await db.delete(routes).where(eq(routes.id, id))
    return json({ ok: true })
  }

  return err('Not found', 404)
}
