import { readFile } from 'fs/promises'
import { z } from 'zod'
import { publicProcedure, router } from '../trpc'

const CADDY_SYSTEM_LOG = process.env.PROXYOS_CADDY_LOG ?? '/data/proxyos/caddy-system.log'
const MAX_LINES = 500

interface CaddyLogEntry {
  ts: number
  level: string
  logger: string
  msg: string
  [key: string]: unknown
}

async function readLastLines(path: string, n: number): Promise<string[]> {
  try {
    const content = await readFile(path, 'utf8')
    const lines = content.split('\n').filter(Boolean)
    return lines.slice(-n)
  } catch {
    return []
  }
}

function parseLine(line: string): CaddyLogEntry | null {
  try {
    return JSON.parse(line) as CaddyLogEntry
  } catch {
    return null
  }
}

export const caddyLogsRouter = router({
  list: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(MAX_LINES).default(200),
      level: z.enum(['info', 'warn', 'error', '']).optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const raw = await readLastLines(CADDY_SYSTEM_LOG, MAX_LINES)
      let entries = raw.map(parseLine).filter((e): e is CaddyLogEntry => e !== null)

      if (input.level) {
        entries = entries.filter(e => e.level === input.level)
      }
      if (input.search) {
        const q = input.search.toLowerCase()
        entries = entries.filter(e =>
          e.msg.toLowerCase().includes(q) ||
          (e.logger ?? '').toLowerCase().includes(q),
        )
      }

      return entries.slice(-input.limit).reverse().map(e => ({
        ts: e.ts,
        level: e.level ?? 'info',
        logger: (e.logger as string) ?? '',
        msg: e.msg,
        // surface useful fields as a detail string
        detail: Object.entries(e)
          .filter(([k]) => !['ts', 'level', 'logger', 'msg'].includes(k))
          .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(' ') || undefined,
      }))
    }),
})
