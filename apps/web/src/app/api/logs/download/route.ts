import { getRecentLogs } from '@proxyos/logger'
import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookies } from '@proxyos/api/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Authenticate and verify admin role
  const cookieHeader = req.headers.get('cookie')

  if (!cookieHeader) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const token = getTokenFromCookies(cookieHeader)
  if (!token) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const parsed = verifyToken(token)
  if (!parsed || parsed.role !== 'admin') {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // User is authenticated and is admin; proceed with log download
  const logs = getRecentLogs()
  const text = logs.map(l => JSON.stringify(l)).join('\n')
  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': 'attachment; filename="proxyos-logs.txt"',
    },
  })
}
