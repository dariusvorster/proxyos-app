import { createHmac, timingSafeEqual } from 'crypto'

export const TOKEN_COOKIE = 'proxyos_token'
const EXPIRES_IN = 60 * 60 * 24 * 30 // 30 days
const COOKIE_SECURE = process.env.PROXYOS_COOKIE_SECURE === 'true'

function buildCookie(name: string, value: string, maxAge: number): string {
  const parts = [`${name}=${value}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (COOKIE_SECURE) parts.push('Secure')
  return parts.join('; ')
}

function secret(): string {
  const s = process.env.PROXYOS_SECRET
  if (!s) throw new Error('PROXYOS_SECRET environment variable must be set')
  return s
}

function b64url(str: string): string {
  return Buffer.from(str).toString('base64url')
}

export function signToken(payload: { userId: string; role: string }): string {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ userId: payload.userId, role: payload.role, iat: now, exp: now + EXPIRES_IN }))
  const sig = createHmac('sha256', secret()).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function verifyToken(token: string): { userId: string; role: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts as [string, string, string]
    const headerData = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
    if (headerData.alg !== 'HS256') return null
    const expected = createHmac('sha256', secret()).update(`${header}.${body}`).digest('base64url')
    if (!timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url'))) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
    return { userId: payload.userId as string, role: payload.role as string }
  } catch {
    return null
  }
}

export function getTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const k = trimmed.slice(0, eq).trim()
    const v = trimmed.slice(eq + 1).trim()
    if (k === TOKEN_COOKIE && v) return v
  }
  return null
}

export function makeTokenCookie(token: string): string {
  return buildCookie(TOKEN_COOKIE, token, EXPIRES_IN)
}

export function clearTokenCookie(): string {
  return buildCookie(TOKEN_COOKIE, '', 0)
}
