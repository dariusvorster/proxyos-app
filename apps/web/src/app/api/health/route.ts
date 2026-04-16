import { getDb } from '@proxyos/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  let dbOk = false
  try {
    const db = getDb()
    db.select().from((await import('@proxyos/db')).routes).limit(1).all()
    dbOk = true
  } catch { /* db unreachable */ }

  const status = dbOk ? 'ok' : 'degraded'
  return new Response(JSON.stringify({
    status,
    version: process.env.PROXYOS_VERSION ?? '3.0.0',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'ok' : 'fail',
  }), {
    status: dbOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  })
}
