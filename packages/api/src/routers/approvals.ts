import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid, pendingChanges, systemSettings, users } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

const ApprovalConfigSchema = z.object({
  enabled: z.boolean().default(false),
  requiredApprovers: z.number().min(1).max(10).default(1),
  exemptRoles: z.array(z.enum(['admin', 'operator', 'viewer'])).default(['admin']),
  exemptActions: z.array(z.string()).default([]),
  timeout: z.number().min(1).max(10080).default(60), // minutes
})

export const approvalsRouter = router({

  // ── Config ──────────────────────────────────────────────────────────────────

  getConfig: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'approval_config')).get()
    if (!row) return ApprovalConfigSchema.parse({})
    try { return ApprovalConfigSchema.parse(JSON.parse(row.value)) } catch { return ApprovalConfigSchema.parse({}) }
  }),

  setConfig: publicProcedure
    .input(ApprovalConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.insert(systemSettings).values({ key: 'approval_config', value: JSON.stringify(input), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: JSON.stringify(input), updatedAt: now } })
      return { ok: true }
    }),

  // ── Pending changes ─────────────────────────────────────────────────────────

  list: publicProcedure
    .input(z.object({ status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending') }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(pendingChanges).orderBy(desc(pendingChanges.requestedAt)).all()
      const filtered = input.status === 'all' ? rows : rows.filter(r => r.status === input.status)

      const userIds = [...new Set([...filtered.map(r => r.requestedBy), ...filtered.map(r => r.approvedBy).filter(Boolean)])] as string[]
      const userRows = userIds.length > 0 ? await ctx.db.select().from(users).all() : []
      const userMap = new Map(userRows.map(u => [u.id, u.email]))

      return filtered.map(r => ({
        id: r.id,
        action: r.action,
        payload: JSON.parse(r.payload) as Record<string, unknown>,
        requestedBy: userMap.get(r.requestedBy) ?? r.requestedBy,
        requestedAt: r.requestedAt,
        approvedBy: r.approvedBy ? (userMap.get(r.approvedBy) ?? r.approvedBy) : null,
        approvedAt: r.approvedAt,
        status: r.status as 'pending' | 'approved' | 'rejected',
      }))
    }),

  submit: publicProcedure
    .input(z.object({
      action: z.string().min(1),
      payload: z.record(z.unknown()),
      requestedBy: z.string(), // userId
    }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(pendingChanges).values({
        id,
        action: input.action,
        payload: JSON.stringify(input.payload),
        requestedBy: input.requestedBy,
        requestedAt: now,
        status: 'pending',
      })
      return { id }
    }),

  approve: publicProcedure
    .input(z.object({ id: z.string(), approvedBy: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.update(pendingChanges).set({
        status: 'approved',
        approvedBy: input.approvedBy,
        approvedAt: now,
      }).where(eq(pendingChanges.id, input.id))
      return { ok: true }
    }),

  reject: publicProcedure
    .input(z.object({ id: z.string(), approvedBy: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      await ctx.db.update(pendingChanges).set({
        status: 'rejected',
        approvedBy: input.approvedBy,
        approvedAt: now,
      }).where(eq(pendingChanges.id, input.id))
      return { ok: true }
    }),

  purgeExpired: publicProcedure.mutation(async ({ ctx }) => {
    const cfgRow = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'approval_config')).get()
    const cfg = cfgRow ? ApprovalConfigSchema.parse(JSON.parse(cfgRow.value)) : ApprovalConfigSchema.parse({})
    const cutoff = new Date(Date.now() - cfg.timeout * 60_000)
    const rows = await ctx.db.select().from(pendingChanges).all()
    let purged = 0
    for (const r of rows) {
      if (r.status === 'pending' && r.requestedAt < cutoff) {
        await ctx.db.update(pendingChanges).set({ status: 'rejected' }).where(eq(pendingChanges.id, r.id))
        purged++
      }
    }
    return { purged }
  }),
})
