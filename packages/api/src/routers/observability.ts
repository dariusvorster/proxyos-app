import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { acmeAccounts, ctAlerts, multiDomainCerts, nanoid, systemSettings } from '@proxyos/db'
import { getCertHealthScore } from '../observability/cert-health'
import { DEFAULT_CT_CONFIG, parseCTConfig, pollCrtSh } from '../observability/ct-monitor'
import { publicProcedure, router } from '../trpc'

// ─── Trace config ────────────────────────────────────────────────────────────

const TraceConfigSchema = z.object({
  enabled: z.boolean(),
  headerName: z.string().min(1).default('X-Request-ID'),
  generateIfMissing: z.boolean().default(true),
  logFormat: z.enum(['json', 'text']).default('json'),
})

// ─── CT config ───────────────────────────────────────────────────────────────

const CTConfigSchema = z.object({
  checkIntervalHours: z.number().min(1).max(168).default(6),
  alertOnNewIssuer: z.boolean().default(true),
  knownIssuers: z.array(z.string()).default(DEFAULT_CT_CONFIG.knownIssuers),
})

// ─── Router ──────────────────────────────────────────────────────────────────

export const observabilityRouter = router({

  // ── Trace config ───────────────────────────────────────────────────────────

  getTraceConfig: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'trace_config')).get()
    if (!row) return { enabled: false, headerName: 'X-Request-ID', generateIfMissing: true, logFormat: 'json' as const }
    try { return TraceConfigSchema.parse(JSON.parse(row.value)) } catch { return { enabled: false, headerName: 'X-Request-ID', generateIfMissing: true, logFormat: 'json' as const } }
  }),

  setTraceConfig: publicProcedure
    .input(TraceConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(systemSettings).values({ key: 'trace_config', value: JSON.stringify(input), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(input), updatedAt: now } })
      return { ok: true }
    }),

  // ── CT monitoring ──────────────────────────────────────────────────────────

  getCTConfig: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'ct_config')).get()
    return parseCTConfig(row?.value)
  }),

  setCTConfig: publicProcedure
    .input(CTConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(systemSettings).values({ key: 'ct_config', value: JSON.stringify(input), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(input), updatedAt: now } })
      return { ok: true }
    }),

  listCTAlerts: publicProcedure
    .input(z.object({ includeAcknowledged: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(ctAlerts).all()
      return input.includeAcknowledged ? rows : rows.filter(r => !r.acknowledged)
    }),

  acknowledgeCTAlert: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(ctAlerts).set({ acknowledged: true }).where(eq(ctAlerts.id, input.id))
      return { ok: true }
    }),

  runCTCheck: publicProcedure
    .input(z.object({ domain: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cfgRow = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'ct_config')).get()
      const cfg = parseCTConfig(cfgRow?.value)

      const newCerts = await pollCrtSh(input.domain, cfg.knownIssuers)
      const now = new Date()
      for (const c of newCerts) {
        await ctx.db.insert(ctAlerts).values({
          id: nanoid(),
          domain: input.domain,
          issuer: c.issuer,
          notBefore: c.notBefore,
          serialNumber: c.serialNumber,
          detectedAt: now,
          acknowledged: false,
        }).onConflictDoNothing()
      }
      return { checked: true, newAlerts: newCerts.length }
    }),

  // ── Certificate health score ───────────────────────────────────────────────

  getCertHealthScore: publicProcedure
    .input(z.object({ domain: z.string() }))
    .query(async ({ input }) => {
      return getCertHealthScore(input.domain)
    }),

  // ── Multi-domain certs ────────────────────────────────────────────────────

  listMultiDomainCerts: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(multiDomainCerts).all()
    return rows.map(r => ({
      ...r,
      domains: JSON.parse(r.domains) as string[],
      routes: JSON.parse(r.routes) as string[],
    }))
  }),

  createMultiDomainCert: publicProcedure
    .input(z.object({
      domains: z.array(z.string().min(1)).min(1),
      mode: z.enum(['auto', 'dns']).default('auto'),
      routes: z.array(z.string()).default([]),
      issuer: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(multiDomainCerts).values({
        id,
        domains: JSON.stringify(input.domains),
        mode: input.mode,
        routes: JSON.stringify(input.routes),
        issuer: input.issuer ?? null,
        createdAt: now,
      })
      return { id }
    }),

  deleteMultiDomainCert: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(multiDomainCerts).where(eq(multiDomainCerts.id, input.id))
      return { ok: true }
    }),

  // ── ACME accounts ─────────────────────────────────────────────────────────

  listAcmeAccounts: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(acmeAccounts).all()
  }),

  createAcmeAccount: publicProcedure
    .input(z.object({
      email: z.string().email(),
      provider: z.enum(['letsencrypt', 'zerossl', 'custom']).default('letsencrypt'),
      acmeUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const acmeUrls: Record<string, string> = {
        letsencrypt: 'https://acme-v02.api.letsencrypt.org/directory',
        zerossl: 'https://acme.zerossl.com/v2/DV90',
      }
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(acmeAccounts).values({
        id,
        email: input.email,
        provider: input.provider,
        acmeUrl: input.acmeUrl ?? acmeUrls[input.provider] ?? '',
        certsCount: 0,
        rateLimitUsed: 0,
        createdAt: now,
      })
      return { id }
    }),

  deleteAcmeAccount: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(acmeAccounts).where(eq(acmeAccounts.id, input.id))
      return { ok: true }
    }),
})
