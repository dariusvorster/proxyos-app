import { readFile } from 'fs/promises'
import { resolve } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const dashboardPath = resolve(process.cwd(), '../../packages/api/src/observability/grafana-dashboard.json')
  try {
    const json = await readFile(dashboardPath, 'utf8')
    return new Response(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="proxyos-grafana-dashboard.json"',
      },
    })
  } catch {
    return new Response('Dashboard not found', { status: 404 })
  }
}
