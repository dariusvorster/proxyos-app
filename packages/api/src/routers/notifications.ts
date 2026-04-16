import { TRPCError } from '@trpc/server'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { webhookDeliveryLog, connections, nanoid } from '@proxyos/db'
import { adapterRegistry } from '@proxyos/connect'
import { WebhookAdapter } from '@proxyos/connect/notifications'
import { publicProcedure, router } from '../trpc'

export const notificationsRouter = router({
  webhookLog: publicProcedure
    .input(z.object({
      connectionId: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const q = ctx.db.select().from(webhookDeliveryLog)
      const rows = input.connectionId
        ? await q.where(eq(webhookDeliveryLog.connectionId, input.connectionId))
            .orderBy(desc(webhookDeliveryLog.deliveredAt))
            .limit(input.limit ?? 50)
            .all()
        : await q.orderBy(desc(webhookDeliveryLog.deliveredAt))
            .limit(input.limit ?? 50)
            .all()
      return rows
    }),

  retryWebhook: publicProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(webhookDeliveryLog)
        .where(eq(webhookDeliveryLog.id, input.deliveryId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const adapter = adapterRegistry.get(row.connectionId)
      if (!adapter || adapter.type !== 'webhook') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Webhook adapter not loaded' })
      }

      const conn = await ctx.db.select().from(connections)
        .where(eq(connections.id, row.connectionId)).get()
      if (!conn) throw new TRPCError({ code: 'NOT_FOUND' })

      const webhookAdapter = adapter as unknown as WebhookAdapter
      let savedId: string | undefined
      webhookAdapter.setDeliveryCallback(async (d) => {
        savedId = d.id
        await ctx.db.insert(webhookDeliveryLog).values({
          id: d.id,
          connectionId: d.connectionId,
          eventType: d.eventType,
          url: d.url,
          statusCode: d.statusCode ?? null,
          responseTimeMs: d.responseTimeMs,
          success: d.success,
          error: d.error ?? null,
          payloadPreview: d.payloadPreview,
          deliveredAt: d.deliveredAt,
        })
      })

      const result = await webhookAdapter.deliver(row.eventType, { retried: true, originalId: row.id })
      return { ok: result.success, newDeliveryId: savedId ?? nanoid() }
    }),
})
