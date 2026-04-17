import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { secretsProviders, systemSettings, nanoid, auditLog } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'
import { TRPCError } from '@trpc/server'

export const lockboxosRouter = router({
  // Called by LockBoxOS when a secret is rotated.
  // Authenticates via a shared webhook secret stored in system_settings.
  rotateNotify: publicProcedure
    .input(z.object({
      webhookSecret: z.string(),
      secretKey: z.string(),
      vaultId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const setting = await ctx.db.select().from(systemSettings)
        .where(eq(systemSettings.key, 'lockboxos_webhook_secret')).get()

      if (!setting || setting.value !== input.webhookSecret) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid webhook secret' })
      }

      // Mark all lockboxos secretsProviders as needing re-test so they re-fetch rotated values
      const providers = await ctx.db.select().from(secretsProviders).all()
      const lockboxProviders = providers.filter(p => p.type === 'lockboxos')

      for (const p of lockboxProviders) {
        await ctx.db.update(secretsProviders)
          .set({ testStatus: 'unknown' })
          .where(eq(secretsProviders.id, p.id))
      }

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'lockboxos.secret_rotated',
        resourceType: 'secrets_provider',
        actor: 'lockboxos',
        detail: JSON.stringify({ secretKey: input.secretKey, vaultId: input.vaultId, affected: lockboxProviders.length }),
        createdAt: new Date(),
      })

      return { ok: true, providersMarkedStale: lockboxProviders.length }
    }),

  // Get/set the webhook secret ProxyOS uses to verify LockBoxOS rotation webhooks
  getWebhookSecret: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings)
      .where(eq(systemSettings.key, 'lockboxos_webhook_secret')).get()
    return { configured: Boolean(row?.value) }
  }),

  setWebhookSecret: publicProcedure
    .input(z.object({ secret: z.string().min(16) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      const existing = await ctx.db.select().from(systemSettings)
        .where(eq(systemSettings.key, 'lockboxos_webhook_secret')).get()
      if (existing) {
        await ctx.db.update(systemSettings)
          .set({ value: input.secret, updatedAt: now })
          .where(eq(systemSettings.key, 'lockboxos_webhook_secret'))
      } else {
        await ctx.db.insert(systemSettings).values({
          key: 'lockboxos_webhook_secret',
          value: input.secret,
          updatedAt: now,
        })
      }
      return { ok: true }
    }),
})
