import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromCookies } from '@proxyos/api/auth'
import { getDb } from '@proxyos/db'
import { checkDatabase, checkCaddy, checkDocker, checkAuth, checkDisk, settled } from '@proxyos/api/health-checks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return new NextResponse('Unauthorized', { status: 401 })

  const token = getTokenFromCookies(cookieHeader)
  if (!token) return new NextResponse('Unauthorized', { status: 401 })

  const parsed = verifyToken(token)
  if (!parsed || parsed.role !== 'admin') return new NextResponse('Unauthorized', { status: 401 })

  const db = getDb()
  const uptimeSeconds = Math.floor(process.uptime())

  const [dbHealth, caddyHealth, dockerHealth, diskHealth] = await Promise.allSettled([
    checkDatabase(db),
    checkCaddy(),
    checkDocker(),
    Promise.resolve(checkDisk()),
  ])

  const components = {
    database: settled(dbHealth),
    caddy_admin: settled(caddyHealth),
    docker: settled(dockerHealth),
    auth: checkAuth(),
    disk: settled(diskHealth),
    federation: { status: 'n/a' as const, reason: 'standalone mode' },
  }

  const statuses = Object.values(components).map(c => c.status)
  const overall = statuses.includes('unhealthy') ? 'unhealthy'
    : statuses.includes('degraded') ? 'degraded'
    : 'healthy'

  return NextResponse.json({
    overall,
    components,
    version: process.env.APP_VERSION ?? 'dev',
    uptime_seconds: uptimeSeconds,
  })
}
