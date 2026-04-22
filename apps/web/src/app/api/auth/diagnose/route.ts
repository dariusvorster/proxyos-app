import { verifyToken, getTokenFromCookies, TOKEN_COOKIE } from '@proxyos/api/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get('cookie')
  const cookiePresent = !!cookieHeader

  if (!cookieHeader) {
    return Response.json({
      authenticated: false,
      reason: 'No session cookie found. Please log in.',
      action: 'login',
      details: {
        cookie_present: false,
        token_valid: false,
      },
      // legacy fields kept for login page compat
      status: 'no-cookie',
      message: 'No session cookie found. Please log in.',
      hint: 'If you just logged in and see this, check that your browser accepts cookies for this domain.',
    })
  }

  const token = getTokenFromCookies(cookieHeader)
  if (!token) {
    const presentKeys = cookieHeader.split(';').map(p => p.trim().split('=')[0]).filter(Boolean)
    return Response.json({
      authenticated: false,
      reason: `Session cookie "${TOKEN_COOKIE}" not found in your request.`,
      action: 'login',
      details: {
        cookie_present: cookiePresent,
        token_valid: false,
        present_cookies: presentKeys,
      },
      // legacy fields
      status: 'no-token-cookie',
      message: `Session cookie "${TOKEN_COOKIE}" not found in your request.`,
      hint: 'Your browser may have cookies from another app on the same domain.',
    })
  }

  const parsed = verifyToken(token)
  if (!parsed) {
    return Response.json({
      authenticated: false,
      reason: "Session token is invalid or expired. The server's signing secret may have changed since you logged in.",
      action: 'login',
      details: {
        cookie_present: cookiePresent,
        token_valid: false,
        token_expired: true,
      },
      // legacy fields
      status: 'invalid-token',
      message: "Session token is invalid or expired. The server's signing secret may have changed since you logged in.",
      hint: 'Log in again. If this keeps happening, make sure PROXYOS_SECRET is stable across restarts.',
    })
  }

  return Response.json({
    authenticated: true,
    reason: 'Session is valid.',
    action: 'none',
    details: {
      cookie_present: cookiePresent,
      token_valid: true,
      role: parsed.role,
    },
    // legacy fields
    status: 'ok',
    userId: parsed.userId,
    role: parsed.role,
  })
}
