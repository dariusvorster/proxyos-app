import { createHmac } from 'crypto'
import type { NextRequest } from 'next/server'
import { getDb } from '@proxyos/db'
import { routeSecurity, routes } from '@proxyos/db'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.PROXYOS_SECRET ?? ''

  let body: { token?: string; host?: string; returnUrl?: string }
  try {
    body = await req.json() as typeof body
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 })
  }

  const { token, host, returnUrl } = body
  if (!token || !host) {
    return Response.json({ error: 'missing fields' }, { status: 400 })
  }

  const db = getDb()
  const route = await db.select().from(routes).where(eq(routes.domain, host)).get()
  if (!route) return Response.json({ error: 'unknown host' }, { status: 400 })

  const secRow = await db.select().from(routeSecurity).where(eq(routeSecurity.routeId, route.id)).get()
  const cfg = secRow?.botChallengeConfig
    ? (JSON.parse(secRow.botChallengeConfig) as { provider: string; secretKey: string })
    : null
  if (!cfg) return Response.json({ error: 'no bot challenge config' }, { status: 400 })

  const verifyUrl = cfg.provider === 'hcaptcha'
    ? 'https://hcaptcha.com/siteverify'
    : 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

  const verifyRes = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: cfg.secretKey, response: token }),
  })
  const verifyData = await verifyRes.json() as { success: boolean }
  if (!verifyData.success) return Response.json({ error: 'challenge failed' }, { status: 403 })

  const ts = Date.now()
  const hmac = createHmac('sha256', secret).update(`${host}:${ts}`).digest('hex')
  const cookieValue = encodeURIComponent(`${hmac}.${ts}`)

  const safeReturn = (returnUrl && returnUrl.startsWith('http')) ? returnUrl : '/'

  return Response.json({ ok: true, returnUrl: safeReturn }, {
    headers: {
      'Set-Cookie': `_bv=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    },
  })
}
