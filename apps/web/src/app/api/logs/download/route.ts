import { getRecentLogs } from '@proxyos/logger'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const logs = getRecentLogs()
  const text = logs.map(l => JSON.stringify(l)).join('\n')
  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': 'attachment; filename="proxyos-logs.txt"',
    },
  })
}
