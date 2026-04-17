import { TRPCError } from '@trpc/server'
import { and, count, eq, gte, isNull } from 'drizzle-orm'
import { access } from 'fs/promises'
import { z } from 'zod'
import { certIssuanceLog, certificates, nanoid, routes } from '@proxyos/db'
import type { Certificate, CertSource, CertStatus } from '@proxyos/types'
import { publicProcedure, router } from '../trpc'

const CADDY_STORAGE_ROOT = '/data/caddy/caddy/certificates'
const CA_DIRS = [
  'acme-v02.api.letsencrypt.org-directory',
  'acme-staging-v02.api.letsencrypt.org-directory',
  'zerossl',
]

async function caddyHasCert(domain: string): Promise<boolean> {
  for (const ca of CA_DIRS) {
    try {
      await access(`${CADDY_STORAGE_ROOT}/${ca}/${domain}/${domain}.crt`)
      return true
    } catch {
      // not found in this CA dir, try next
    }
  }
  return false
}

function rowToCert(row: typeof certificates.$inferSelect): Certificate {
  return {
    id: row.id,
    domain: row.domain,
    source: row.source as CertSource,
    status: row.status as CertStatus,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    autoRenew: row.autoRenew,
    lastRenewedAt: row.lastRenewedAt,
    routeId: row.routeId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function sourceFromTlsMode(tlsMode: string): CertSource {
  switch (tlsMode) {
    case 'dns':
      return 'dns01'
    case 'internal':
      return 'internal'
    case 'custom':
      return 'custom'
    case 'off':
      return 'acme_le'
    default:
      return 'acme_le'
  }
}

export const certificatesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    await syncFromRoutes(ctx.db)
    const rows = await ctx.db.select().from(certificates)
    return rows.map(rowToCert).sort((a, b) => a.domain.localeCompare(b.domain))
  }),

  check: publicProcedure.mutation(async ({ ctx }) => {
    await syncFromRoutes(ctx.db)
    const rows = await ctx.db.select().from(certificates)
    const checked: Array<{ domain: string; reachable: boolean; expiresAt?: Date | null }> = []
    for (const c of rows) {
      checked.push({ domain: c.domain, reachable: !!c.expiresAt, expiresAt: c.expiresAt })
    }
    return { checked: checked.length, results: checked }
  }),

  renew: publicProcedure
    .input(z.object({ domain: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const url = `${process.env.CADDY_ADMIN_URL ?? 'http://localhost:2019'}/load`
        const cfg = await ctx.caddy.getConfig()
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
        if (!res.ok) throw new Error(String(res.status))
        return { success: true, domain: input.domain, message: 'Caddy reload triggered — renewal will retry on next scheduled run.' }
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Renew failed: ${(err as Error).message}` })
      }
    }),

  upload: publicProcedure
    .input(z.object({
      domain: z.string().min(1),
      cert: z.string().min(1),
      key: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date()
      const id = nanoid()
      await ctx.db.insert(certificates).values({
        id, domain: input.domain, source: 'custom', status: 'active',
        issuedAt: now, expiresAt: null, autoRenew: false, routeId: null,
        createdAt: now, updatedAt: now,
      })
      return { id, domain: input.domain, message: 'Cert recorded. Caddy load_cert wiring is a TODO.' }
    }),

  getRateLimitStatus: publicProcedure
    .input(z.object({ domain: z.string() }))
    .query(async ({ input, ctx }) => {
      // Extract eTLD+1: take last 2 parts of domain
      const parts = input.domain.split('.')
      const registeredDomain = parts.length >= 2 ? parts.slice(-2).join('.') : input.domain

      // Start of current week (Monday 00:00 UTC)
      const now = new Date()
      const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon...
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const weekStart = new Date(now)
      weekStart.setUTCDate(now.getUTCDate() - daysSinceMonday)
      weekStart.setUTCHours(0, 0, 0, 0)

      const rows = await ctx.db
        .select({ count: count() })
        .from(certIssuanceLog)
        .where(
          and(
            eq(certIssuanceLog.registeredDomain, registeredDomain),
            eq(certIssuanceLog.provider, 'letsencrypt'),
            gte(certIssuanceLog.issuedAt, weekStart),
          ),
        )

      const used = rows[0]?.count ?? 0
      const limit = 50
      return {
        registeredDomain,
        used,
        limit,
        nearLimit: used >= 45,
        atLimit: used >= 50,
      }
    }),
})

async function syncFromRoutes(db: import('@proxyos/db').Db): Promise<void> {
  const routeRows = await db.select().from(routes)
  const existing = await db.select().from(certificates)
  const byDomain = new Map(existing.map((c) => [c.domain, c]))
  const now = new Date()

  for (const r of routeRows) {
    if (r.tlsMode === 'off') continue
    const prior = byDomain.get(r.domain)
    const source = sourceFromTlsMode(r.tlsMode)
    const hasActiveCert = await caddyHasCert(r.domain)
    if (!prior) {
      await db.insert(certificates).values({
        id: nanoid(),
        domain: r.domain,
        source,
        status: hasActiveCert ? 'active' : 'provisioning',
        autoRenew: true,
        routeId: r.id,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      const updates: Record<string, unknown> = { updatedAt: now }
      if (prior.routeId !== r.id) updates.routeId = r.id
      if (prior.source !== source) updates.source = source
      if (hasActiveCert && prior.status === 'provisioning') updates.status = 'active'
      await db.update(certificates).set(updates).where(eq(certificates.id, prior.id))
    }
  }

  const domainSet = new Set(routeRows.filter((r) => r.tlsMode !== 'off').map((r) => r.domain))
  for (const c of existing) {
    if (!domainSet.has(c.domain) && c.source !== 'custom') {
      await db.delete(certificates).where(and(eq(certificates.id, c.id), isNull(certificates.lastRenewedAt)))
    }
  }
}
