import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import fs from 'fs'
import { systemSettings, type Db } from '@proxyos/db'
import { publicProcedure, adminProcedure, router } from '../trpc'
import { getRecentLogs } from '@proxyos/logger'

type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy' | 'n/a'

interface ComponentResult {
  status: ComponentStatus
  [key: string]: unknown
}

export function settled(result: PromiseSettledResult<ComponentResult>): ComponentResult {
  if (result.status === 'fulfilled') return result.value
  return { status: 'unhealthy', error: (result.reason as Error)?.message ?? String(result.reason) }
}

export async function checkDatabase(db: Db): Promise<ComponentResult> {
  const start = Date.now()
  db.get(sql`SELECT 1`)
  const latency_ms = Date.now() - start
  return { status: 'healthy', latency_ms }
}

export async function checkCaddy(): Promise<ComponentResult> {
  const base = process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019'
  const res = await fetch(`${base}/config/`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return { status: 'unhealthy', error: `HTTP ${res.status}` }
  // Caddy admin /config/ is reachable; version not exposed via this endpoint
  return { status: 'healthy', version: 'ok' }
}

export async function checkDocker(): Promise<ComponentResult> {
  return new Promise((resolve) => {
    const http = require('http') as typeof import('http')
    const req = http.request(
      { socketPath: '/var/run/docker.sock', path: '/info', method: 'GET', timeout: 5000 },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString()) as { Containers?: number }
            resolve({ status: 'healthy', containers_known: data.Containers ?? 0 })
          } catch {
            resolve({ status: 'unhealthy', error: 'Failed to parse Docker info' })
          }
        })
      },
    )
    req.on('error', (err: Error) => resolve({ status: 'unhealthy', error: err.message }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 'unhealthy', error: 'timeout' }) })
    req.end()
  })
}

export function checkAuth(): ComponentResult {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) return { status: 'unhealthy', secret_set: false, secret_length: 0 }
  return { status: 'healthy', secret_set: true, secret_length: secret.length }
}

export function checkDisk(): ComponentResult {
  const stats = fs.statfsSync('/')
  const total = stats.blocks * stats.bsize
  const free = stats.bfree * stats.bsize
  const used = total - free
  const percent_used = total === 0 ? 0 : Math.round((used / total) * 100)
  const status: ComponentStatus = percent_used >= 95 ? 'unhealthy' : percent_used >= 85 ? 'degraded' : 'healthy'
  return { status, percent_used }
}

export const systemRouter = router({
  caddyStatus: publicProcedure.query(async ({ ctx }) => {
    const reachable = await ctx.caddy.health()
    const hasMain = reachable ? await ctx.caddy.hasServer('main') : false
    return { reachable, hasMain }
  }),

  deploymentMode: publicProcedure.query(() => {
    const tier = (process.env.PROXYOS_TIER ?? 'homelab') as 'homelab' | 'cloud'
    const mode = (process.env.PROXYOS_MODE ?? 'standalone') as 'central' | 'node' | 'standalone'
    return { tier, mode }
  }),

  getForceHttps: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'force_https')).get()
    return { enabled: row?.value === 'true' }
  }),

  setForceHttps: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date()
      await ctx.db
        .insert(systemSettings)
        .values({ key: 'force_https', value: String(input.enabled), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(input.enabled), updatedAt: now } })
      if (input.enabled) {
        await ctx.caddy.setHttpRedirectServer()
      } else {
        await ctx.caddy.removeHttpRedirectServer()
      }
      return { enabled: input.enabled }
    }),

  getLogs: adminProcedure
    .input(z.object({
      subsystem: z.string().optional(),
      level: z.enum(['info', 'warn', 'error']).optional(),
      limit: z.number().min(1).max(500).default(200),
    }))
    .query(({ input }) => {
      const levelNums: Record<string, number> = { info: 30, warn: 40, error: 50 }
      let logs = getRecentLogs()
      if (input.subsystem) logs = logs.filter(l => l.subsystem === input.subsystem)
      if (input.level) {
        const levelNum = levelNums[input.level] ?? 0
        logs = logs.filter(l => l.level >= levelNum)
      }
      return logs.slice(-input.limit)
    }),

  getDetailedHealth: adminProcedure.query(async ({ ctx }) => {
    const uptimeSeconds = Math.floor(process.uptime())
    const [dbHealth, caddyHealth, dockerHealth, diskHealth] = await Promise.allSettled([
      checkDatabase(ctx.db),
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

    return {
      overall: overall as 'healthy' | 'degraded' | 'unhealthy',
      components,
      version: process.env.APP_VERSION ?? 'dev',
      uptime_seconds: uptimeSeconds,
    }
  }),
})
