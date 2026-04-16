import { getDb } from '@proxyos/db'
import { renderPrometheusMetrics } from '@proxyos/api/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const token = process.env.METRICS_TOKEN
  if (token) {
    const auth = req.headers.get('authorization') ?? ''
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (bearer !== token) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const db = getDb()
  const body = await renderPrometheusMetrics(db)
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  })
}
