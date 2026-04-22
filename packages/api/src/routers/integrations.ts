import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { lockboxRefs, nanoid, patchosVersions, routes, systemSettings } from '@proxyos/db'
import { buildBackupOSRegistration } from '../automation/backupos'
import { parseLockBoxConfig, fetchFromLockBox } from '../automation/lockboxos'
import { detectMailRoutes } from '../automation/mxwatch'
import { publicProcedure, adminProcedure, router } from '../trpc'

// ─── InfraOS ─────────────────────────────────────────────────────────────────

const InfraOSConfigSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1),
  bidirectional: z.boolean().default(true),
})

// ─── LockBox ─────────────────────────────────────────────────────────────────

const LockBoxConfigSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1),
})

// ─── PatchOS ─────────────────────────────────────────────────────────────────

const PatchOSConfigSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1),
  enableAutoRollback: z.boolean().default(true),
})

export const integrationsRouter = router({

  // ── InfraOS ──────────────────────────────────────────────────────────────────

  getInfraOSConfig: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'infraos_config')).get()
    if (!row) return null
    try { return InfraOSConfigSchema.parse(JSON.parse(row.value)) } catch { return null }
  }),

  setInfraOSConfig: adminProcedure
    .input(InfraOSConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(systemSettings).values({ key: 'infraos_config', value: JSON.stringify(input), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(input), updatedAt: now } })
      return { ok: true }
    }),

  // ios expose: create a ProxyOS route from InfraOS
  infraOSExpose: adminProcedure
    .input(z.object({
      domain: z.string().min(1),
      upstream: z.string().min(1),
      tlsMode: z.string().default('auto'),
      serviceId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Import inline to avoid circular dep
      const { nanoid: nid } = await import('@proxyos/db')
      const id = nid()
      const now = new Date()
      await ctx.db.insert(routes as typeof import('@proxyos/db').routes).values({
        id,
        name: input.domain,
        domain: input.domain,
        enabled: true,
        upstreamType: 'http',
        upstreams: JSON.stringify([{ url: input.upstream }]),
        tlsMode: input.tlsMode,
        ssoEnabled: false,
        healthCheckEnabled: true,
        healthCheckPath: '/',
        healthCheckInterval: 30,
        compressionEnabled: true,
        websocketEnabled: true,
        http2Enabled: true,
        http3Enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      return { routeId: id }
    }),

  // ── BackupOS ──────────────────────────────────────────────────────────────────

  getBackupOSRegistration: publicProcedure.query(() => {
    const dbPath = process.env.PROXYOS_DB_PATH ?? './proxyos.db'
    return buildBackupOSRegistration(dbPath)
  }),

  // ── LockBoxOS ─────────────────────────────────────────────────────────────────

  getLockBoxConfig: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'lockboxos_config')).get()
    if (!row) return null
    const cfg = parseLockBoxConfig(row.value)
    return cfg ? { baseUrl: cfg.baseUrl } : null // never return token in GET
  }),

  setLockBoxConfig: adminProcedure
    .input(LockBoxConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(systemSettings).values({ key: 'lockboxos_config', value: JSON.stringify(input), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(input), updatedAt: now } })
      return { ok: true }
    }),

  listLockBoxRefs: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(lockboxRefs).all()
  }),

  createLockBoxRef: adminProcedure
    .input(z.object({
      connectionId: z.string(),
      credentialKey: z.string().min(1),
      vaultId: z.string().min(1),
      secretPath: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(lockboxRefs).values({ id, ...input, createdAt: now })
      return { id }
    }),

  deleteLockBoxRef: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(lockboxRefs).where(eq(lockboxRefs.id, input.id))
      return { ok: true }
    }),

  testLockBoxRef: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ref = await ctx.db.select().from(lockboxRefs).where(eq(lockboxRefs.id, input.id)).get()
      if (!ref) throw new TRPCError({ code: 'NOT_FOUND', message: `LockBox ref with ID '${input.id}' not found` })
      const cfgRow = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'lockboxos_config')).get()
      const cfg = parseLockBoxConfig(cfgRow?.value)
      if (!cfg) throw new TRPCError({ code: 'BAD_REQUEST', message: 'LockBoxOS is not configured — set baseUrl and token first' })
      const result = await fetchFromLockBox(cfg, { vaultId: ref.vaultId, secretPath: ref.secretPath })
      return { reachable: result.ok, hasValue: result.ok && result.value.length > 0 }
    }),

  // ── MxWatch ──────────────────────────────────────────────────────────────────

  getMxWatchConfig: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'mxwatch_config')).get()
    if (!row) return null
    try { return JSON.parse(row.value) as { baseUrl: string } } catch { return null }
  }),

  setMxWatchConfig: adminProcedure
    .input(z.object({ baseUrl: z.string().url(), token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(systemSettings).values({ key: 'mxwatch_config', value: JSON.stringify(input), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(input), updatedAt: now } })
      return { ok: true }
    }),

  detectMailRoutes: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(routes).all()
    return detectMailRoutes(rows.map(r => ({ id: r.id, domain: r.domain, upstreams: r.upstreams })))
  }),

  // ── PatchOS ──────────────────────────────────────────────────────────────────

  getPatchOSConfig: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'patchos_config')).get()
    if (!row) return null
    try { return PatchOSConfigSchema.parse(JSON.parse(row.value)) } catch { return null }
  }),

  setPatchOSConfig: adminProcedure
    .input(PatchOSConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(systemSettings).values({ key: 'patchos_config', value: JSON.stringify(input), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(input), updatedAt: now } })
      return { ok: true }
    }),

  listAgentVersions: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(patchosVersions).all()
  }),

  recordAgentVersion: adminProcedure
    .input(z.object({
      agentId: z.string(),
      version: z.string().min(1),
      health: z.enum(['ok', 'fail']).default('ok'),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(patchosVersions).values({ agentId: input.agentId, version: input.version, health: input.health, recordedAt: now })
        .onConflictDoUpdate({ target: patchosVersions.agentId, set: { version: input.version, health: input.health, recordedAt: now } })
      return { ok: true }
    }),
})
