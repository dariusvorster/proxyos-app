import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { alertEvents, alertRules, auditLog, nanoid, systemSettings } from '@proxyos/db'
import type { AlertEvent, AlertRule, AlertRuleConfig, AlertType } from '@proxyos/types'
import { sendTestEmail, sendTestWebhook } from '@proxyos/alerts'
import type { SmtpConfig } from '@proxyos/alerts'
import { publicProcedure, operatorProcedure, router } from '../trpc'

const alertTypes = ['error_rate_spike', 'latency_spike', 'cert_expiring', 'traffic_spike'] as const

const configSchema = z.object({
  thresholdRequests: z.number().int().min(1).optional(),
  errorRatePct: z.number().min(0).max(100).optional(),
  p95LatencyMs: z.number().int().min(1).optional(),
  daysBeforeExpiry: z.number().int().min(1).max(365).optional(),
  requestsPerMinute: z.number().int().min(1).optional(),
  windowMinutes: z.number().int().min(1).max(1440).optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
})

function rowToRule(row: typeof alertRules.$inferSelect): AlertRule {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AlertType,
    targetRouteId: row.targetRouteId,
    config: JSON.parse(row.config) as AlertRuleConfig,
    enabled: row.enabled,
    lastFiredAt: row.lastFiredAt,
    createdAt: row.createdAt,
  }
}

function rowToEvent(row: typeof alertEvents.$inferSelect): AlertEvent {
  return {
    id: row.id,
    ruleId: row.ruleId,
    routeId: row.routeId,
    message: row.message,
    detail: row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null,
    firedAt: row.firedAt,
  }
}

export const alertsRouter = router({
  listRules: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(alertRules)
    return rows.map(rowToRule)
  }),

  createRule: operatorProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        type: z.enum(alertTypes),
        targetRouteId: z.string().nullable().default(null),
        config: configSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(alertRules).values({
        id,
        name: input.name,
        type: input.type,
        targetRouteId: input.targetRouteId,
        config: JSON.stringify(input.config),
        enabled: true,
        createdAt: now,
      })
      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'alert.create',
        resourceType: 'alert_rule',
        resourceId: id,
        resourceName: input.name,
        actor: 'user',
        detail: JSON.stringify({ type: input.type, config: input.config }),
        createdAt: now,
      })
      return { id }
    }),

  upsertRule: operatorProcedure
    .input(z.object({
      id: z.string().nullable().optional(),
      name: z.string().min(1).max(100),
      type: z.enum(alertTypes),
      targetRouteId: z.string().nullable().default(null),
      config: configSchema,
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      if (input.id) {
        await ctx.db.update(alertRules).set({
          name: input.name, type: input.type,
          targetRouteId: input.targetRouteId,
          config: JSON.stringify(input.config),
          enabled: input.enabled,
        }).where(eq(alertRules.id, input.id))
        return { id: input.id, updated: true }
      }
      const id = nanoid()
      await ctx.db.insert(alertRules).values({
        id, name: input.name, type: input.type,
        targetRouteId: input.targetRouteId,
        config: JSON.stringify(input.config),
        enabled: input.enabled,
        createdAt: now,
      })
      return { id, created: true }
    }),

  deleteRule: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(alertRules).where(eq(alertRules.id, input.id)).get()
      await ctx.db.delete(alertRules).where(eq(alertRules.id, input.id))
      if (row) {
        await ctx.db.insert(auditLog).values({
          id: nanoid(),
          action: 'alert.delete',
          resourceType: 'alert_rule',
          resourceId: input.id,
          resourceName: row.name,
          actor: 'user',
          createdAt: new Date(),
        })
      }
      return { success: true }
    }),

  toggleRule: operatorProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(alertRules).set({ enabled: input.enabled }).where(eq(alertRules.id, input.id))
      return { success: true }
    }),

  listEvents: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(alertEvents).orderBy(desc(alertEvents.firedAt)).limit(input.limit)
      return rows.map(rowToEvent)
    }),

  // ── Notification config ─────────────────────────────────────────────────────

  getNotifyConfig: publicProcedure.query(async ({ ctx }) => {
    const [smtpRow, webhookRow] = await Promise.all([
      ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'alert_smtp')).get(),
      ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'alert_webhook')).get(),
    ])
    let smtp: (SmtpConfig & { pass: string }) | null = null
    if (smtpRow?.value) {
      try {
        const raw = JSON.parse(smtpRow.value) as SmtpConfig
        smtp = { ...raw, pass: raw.pass ? '•••' : '' }
      } catch { /* ignore */ }
    }
    return { smtp, webhookUrl: webhookRow?.value ?? null }
  }),

  setSmtpConfig: operatorProcedure
    .input(z.object({
      host: z.string(),
      port: z.number().int().min(1).max(65535).default(587),
      secure: z.boolean().default(false),
      user: z.string(),
      pass: z.string(),
      from: z.string(),
      to: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // If pass is the redaction sentinel, keep existing password
      let pass = input.pass
      if (pass === '•••') {
        const existing = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'alert_smtp')).get()
        if (existing?.value) {
          try { pass = (JSON.parse(existing.value) as SmtpConfig).pass } catch { pass = '' }
        }
      }
      const value = JSON.stringify({ ...input, pass })
      const now = new Date()
      await ctx.db.insert(systemSettings).values({ key: 'alert_smtp', value, updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: now } })
      return { ok: true }
    }),

  setWebhookConfig: operatorProcedure
    .input(z.object({ url: z.string().url().or(z.literal('')) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      if (!input.url) {
        await ctx.db.delete(systemSettings).where(eq(systemSettings.key, 'alert_webhook'))
      } else {
        await ctx.db.insert(systemSettings).values({ key: 'alert_webhook', value: input.url, updatedAt: now })
          .onConflictDoUpdate({ target: systemSettings.key, set: { value: input.url, updatedAt: now } })
      }
      return { ok: true }
    }),

  testSmtp: operatorProcedure
    .input(z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean(),
      user: z.string(),
      pass: z.string(),
      from: z.string(),
      to: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Resolve redacted pass from stored config
      let pass = input.pass
      if (pass === '•••') {
        const existing = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'alert_smtp')).get()
        if (existing?.value) {
          try { pass = (JSON.parse(existing.value) as SmtpConfig).pass } catch { pass = '' }
        }
      }
      await sendTestEmail({ ...input, pass })
      return { ok: true }
    }),

  testWebhook: operatorProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      await sendTestWebhook(input.url)
      return { ok: true }
    }),
})
