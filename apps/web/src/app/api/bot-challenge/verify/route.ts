import { createHmac } from 'crypto'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

function isValidBotToken(token: string, host: string, secret: string): boolean {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return false
  const hmac = token.slice(0, dot)
  const ts = Number(token.slice(dot + 1))
  if (isNaN(ts) || Date.now() - ts > 86_400_000) return false
  const expected = createHmac('sha256', secret).update(`${host}:${ts}`).digest('hex')
  return hmac === expected
}

export async function GET(req: NextRequest) {
  const secret = process.env.PROXYOS_SECRET ?? ''
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  const cookie = req.headers.get('cookie') ?? ''

  const bvMatch = cookie.match(/_bv=([^;]+)/)
  const token = bvMatch ? decodeURIComponent(bvMatch[1]!) : null

  if (token && isValidBotToken(token, host, secret)) {
    return new Response('ok', { status: 200, headers: { 'X-Bot-Verified': '1' } })
  }

  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const uri = req.headers.get('x-forwarded-uri') ?? '/'
  const returnUrl = encodeURIComponent(`${proto}://${host}${uri}`)

  return new Response('challenge required', {
    status: 401,
    headers: {
      'Location': `/bot-challenge?returnUrl=${returnUrl}&host=${encodeURIComponent(host)}`,
    },
  })
}
