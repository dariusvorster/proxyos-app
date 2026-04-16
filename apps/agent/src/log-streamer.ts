import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { createInterface } from 'readline'
import type { MsgLogLine } from '@proxyos/federation'
import { getDomainToRouteId } from './caddy-sync'

const LOG_PATH = process.env.CADDY_LOG_PATH ?? '/var/log/caddy/access.log'
const POLL_INTERVAL_MS = 1_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let currentOffset = 0

export function startLogStreamer(agentId: string, send: (msg: MsgLogLine) => void): void {
  // Seek to end of current file so we only stream new lines
  stat(LOG_PATH)
    .then(s => { currentOffset = s.size })
    .catch(() => { currentOffset = 0 })

  pollTimer = setInterval(() => {
    void pollLog(agentId, send)
  }, POLL_INTERVAL_MS)
}

export function stopLogStreamer(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function pollLog(agentId: string, send: (msg: MsgLogLine) => void): Promise<void> {
  let size: number
  try {
    const s = await stat(LOG_PATH)
    size = s.size
  } catch {
    return  // log file doesn't exist yet — Caddy not writing
  }

  if (size <= currentOffset) return  // no new bytes

  const stream = createReadStream(LOG_PATH, { start: currentOffset, end: size - 1 })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  const domainMap = getDomainToRouteId()

  for await (const rawLine of rl) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue
    try {
      const entry = JSON.parse(trimmed) as Record<string, unknown>
      // Caddy structured log: entry.request.host is the virtual host
      const req = entry['request'] as Record<string, unknown> | undefined
      const host = typeof req?.['host'] === 'string' ? req['host'] : undefined
      const routeId = host ? (domainMap.get(host) ?? 'unknown') : 'unknown'
      send({ type: 'log.line', agentId, routeId, line: entry })
    } catch {
      // Non-JSON line (startup banners, etc.) — skip
    }
  }

  currentOffset = size
}
