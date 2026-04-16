import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { alertEvents, alertRules, auditLog, nanoid } from '@proxyos/db'
import type { AlertEvent, AlertRule, AlertRuleConfig, AlertType } from '@proxyos/types'
import { publicProcedure, router } from '../trpc'

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

  createRule: publicProcedure
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

  upsertRule: publicProcedure
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

  deleteRule: publicProcedure
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

  toggleRule: publicProcedure
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
})
