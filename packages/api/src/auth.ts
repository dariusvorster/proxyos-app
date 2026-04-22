import { createHmac, timingSafeEqual } from 'crypto'
import { createLogger } from '@proxyos/logger'

const logger = createLogger('[api]')

export const TOKEN_COOKIE = 'proxyos_token'
const EXPIRES_IN = 60 * 60 * 24 * 30 // 30 days

// Enforce PROXYOS_SECRET at startup — skip during Next.js build phase
const _secret = process.env.PROXYOS_SECRET as string
const _isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
if (!_secret) {
  if (!_isBuildPhase) {
    logger.fatal('PROXYOS_SECRET environment variable is not set. Set it to a random 32+ character value in your docker-compose.yml. Without it, sessions cannot be signed and all logins will fail.')
    process.exit(1)
  }
} else {
  if (_secret.length < 32) {
    logger.warn('PROXYOS_SECRET is shorter than 32 characters. Recommend at least 32.')
  }
  const WEAK_SECRETS = ['changeme', 'secret', 'password', 'default', 'proxyos']
  if (WEAK_SECRETS.includes(_secret.toLowerCase())) {
    logger.fatal('PROXYOS_SECRET is set to a known-weak value. Refusing to start.')
    process.exit(1)
  }
}

function detectSecure(req: Request): boolean {
  const envOverride = process.env.PROXYOS_COOKIE_SECURE
  if (envOverride === 'true') return true
  if (envOverride === 'false') return false
  const forwardedProto = req.headers.get('x-forwarded-proto')
  if (forwardedProto) return forwardedProto === 'https'
  try {
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false
  }
}

function buildCookie(name: string, value: string, maxAge: number, isSecure: boolean): string {
  const parts = [`${name}=${value}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (isSecure) parts.push('Secure')
  return parts.join('; ')
}

function b64url(str: string): string {
  return Buffer.from(str).toString('base64url')
}

export function signToken(payload: { userId: string; role: string }): string {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ userId: payload.userId, role: payload.role, iat: now, exp: now + EXPIRES_IN }))
  const sig = createHmac('sha256', _secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function verifyToken(token: string): { userId: string; role: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts as [string, string, string]
    const headerData = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
    if (headerData.alg !== 'HS256') return null
    const expected = createHmac('sha256', _secret).update(`${header}.${body}`).digest('base64url')
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

export function makeTokenCookie(token: string, req: Request): string {
  return buildCookie(TOKEN_COOKIE, token, EXPIRES_IN, detectSecure(req))
}

export function clearTokenCookie(req: Request): string {
  return buildCookie(TOKEN_COOKIE, '', 0, detectSecure(req))
}
