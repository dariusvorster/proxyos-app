import { verifyToken, getTokenFromCookies, TOKEN_COOKIE } from '@proxyos/api/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get('cookie')

  if (!cookieHeader) {
    return Response.json({
      status: 'no-cookie',
      message: 'No session cookie found. Please log in.',
      hint: 'If you just logged in and see this, check that your browser accepts cookies for this domain.',
    })
  }

  const token = getTokenFromCookies(cookieHeader)
  if (!token) {
    const presentKeys = cookieHeader.split(';').map(p => p.trim().split('=')[0]).filter(Boolean)
    return Response.json({
      status: 'no-token-cookie',
      message: `Session cookie "${TOKEN_COOKIE}" not found in your request.`,
      cookies: presentKeys,
      hint: 'Your browser may have cookies from another app on the same domain.',
    })
  }

  const parsed = verifyToken(token)
  if (!parsed) {
    return Response.json({
      status: 'invalid-token',
      message: "Session token is invalid or expired. The server's signing secret may have changed since you logged in.",
      hint: 'Log in again. If this keeps happening, make sure PROXYOS_SECRET is stable across restarts.',
    })
  }

  return Response.json({ status: 'ok', userId: parsed.userId, role: parsed.role })
}
