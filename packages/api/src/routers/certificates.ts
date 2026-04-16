import { TRPCError } from '@trpc/server'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { certificates, nanoid, routes } from '@proxyos/db'
import type { Certificate, CertSource, CertStatus } from '@proxyos/types'
import { publicProcedure, router } from '../trpc'

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
    if (!prior) {
      await db.insert(certificates).values({
        id: nanoid(),
        domain: r.domain,
        source,
        status: 'provisioning',
        autoRenew: true,
        routeId: r.id,
        createdAt: now,
        updatedAt: now,
      })
    } else if (prior.routeId !== r.id || prior.source !== source) {
      await db
        .update(certificates)
        .set({ routeId: r.id, source, updatedAt: now })
        .where(eq(certificates.id, prior.id))
    }
  }

  const domainSet = new Set(routeRows.filter((r) => r.tlsMode !== 'off').map((r) => r.domain))
  for (const c of existing) {
    if (!domainSet.has(c.domain) && c.source !== 'custom') {
      await db.delete(certificates).where(and(eq(certificates.id, c.id), isNull(certificates.lastRenewedAt)))
    }
  }
}
