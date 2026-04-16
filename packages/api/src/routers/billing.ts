import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  nanoid,
  billingEntitlements,
  billingEvents,
  billingSubscriptions,
  billingWebhookEvents,
  licenceKeys,
} from '@proxyos/db'
import {
  createCheckout,
  getVariantId,
  getCustomerPortalUrl,
  activateLicenceKey,
  deactivateLicenceKey,
  deriveEntitlementFeatures,
} from '@proxyos/billing'
import { publicProcedure, router } from '../trpc'

const PRODUCT = (process.env.HOMELABOS_PRODUCT ?? 'proxyos') as 'proxyos'

const PLAN_PRICES: Record<string, Record<string, number>> = {
  solo: { monthly: 9, annual: 90 },
  teams: { monthly: 29, annual: 290 },
}

export const billingRouter = router({

  // ── Current state ────────────────────────────────────────────────────────────

  getSubscription: publicProcedure.query(async ({ ctx }) => {
    const sub = await ctx.db
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.product, PRODUCT),
          eq(billingSubscriptions.status, 'active'),
        ),
      )
      .orderBy(desc(billingSubscriptions.createdAt))
      .limit(1)
      .get()
    return sub ?? null
  }),

  getTrialSubscription: publicProcedure.query(async ({ ctx }) => {
    const sub = await ctx.db
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.product, PRODUCT),
          eq(billingSubscriptions.status, 'on_trial'),
        ),
      )
      .orderBy(desc(billingSubscriptions.createdAt))
      .limit(1)
      .get()
    return sub ?? null
  }),

  getEntitlements: publicProcedure
    .input(z.object({ userId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.userId) {
        const ent = await ctx.db
          .select()
          .from(billingEntitlements)
          .where(
            and(
              eq(billingEntitlements.userId, input.userId),
              eq(billingEntitlements.product, PRODUCT),
            ),
          )
          .get()
        if (ent) {
          return deriveEntitlementFeatures(
            PRODUCT,
            ent.plan as 'free' | 'solo' | 'teams' | 'bundle',
            ent.source as 'subscription' | 'licence' | 'bundle' | 'free',
            ent.validUntil ?? null,
          )
        }
      }
      return deriveEntitlementFeatures(PRODUCT, 'free', 'free', null)
    }),

  getLicence: publicProcedure.query(async ({ ctx }) => {
    const key = await ctx.db
      .select()
      .from(licenceKeys)
      .where(
        and(
          eq(licenceKeys.product, PRODUCT),
          eq(licenceKeys.status, 'active'),
        ),
      )
      .orderBy(desc(licenceKeys.createdAt))
      .limit(1)
      .get()
    return key ?? null
  }),

  getEvents: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.product, PRODUCT))
      .orderBy(desc(billingEvents.createdAt))
      .limit(50)
  }),

  // ── Checkout ─────────────────────────────────────────────────────────────────

  createCheckout: publicProcedure
    .input(
      z.object({
        plan: z.enum(['solo', 'teams']),
        interval: z.enum(['monthly', 'annual']),
        licenceType: z.enum(['cloud', 'sh_pro', 'sh_teams']).default('cloud'),
        userId: z.string(),
        email: z.string().email(),
        includeTrial: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const variantId = getVariantId(PRODUCT, input.plan, input.interval, input.licenceType)
      if (!variantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Variant not configured for ${input.plan}/${input.interval}/${input.licenceType}. Set the corresponding VARIANT_ID env var.`,
        })
      }

      const trialDays = input.includeTrial
        ? Number(process.env.TRIAL_DAYS ?? 14)
        : undefined

      const url = await createCheckout({
        variantId,
        userId: input.userId,
        email: input.email,
        product: PRODUCT,
        plan: input.plan,
        licenceType: input.licenceType,
        successUrl: process.env.BILLING_SUCCESS_URL ?? 'http://localhost:3000/billing/success',
        cancelUrl: process.env.BILLING_CANCEL_URL ?? 'http://localhost:3000/billing',
        trialDays,
      })

      return { url }
    }),

  // ── Customer portal ───────────────────────────────────────────────────────────

  getPortalUrl: publicProcedure
    .input(z.object({ lsCustomerId: z.string() }))
    .query(async ({ input }) => {
      const url = await getCustomerPortalUrl(input.lsCustomerId)
      return { url }
    }),

  // ── Licence key (self-hosted) ────────────────────────────────────────────────

  activateLicence: publicProcedure
    .input(
      z.object({
        licenceKey: z.string().min(1),
        instanceName: z.string().min(1),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await activateLicenceKey(input.licenceKey, input.instanceName)

      await ctx.db.insert(licenceKeys).values({
        id: nanoid(),
        product: PRODUCT,
        purchaserEmail: result.purchaserEmail,
        lsLicenceKey: input.licenceKey,
        lsOrderId: result.orderId,
        lsVariantId: result.variantId,
        lsInstanceId: result.instanceId,
        plan: result.plan,
        billingInterval: result.billingInterval,
        status: 'active',
        instanceName: input.instanceName,
        lastValidatedAt: Date.now(),
        validationFailures: 0,
        gracePeriodUntil: null,
        expiresAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      // Upsert entitlement
      const existing = await ctx.db
        .select()
        .from(billingEntitlements)
        .where(
          and(
            eq(billingEntitlements.userId, input.userId),
            eq(billingEntitlements.product, PRODUCT),
          ),
        )
        .get()

      if (existing) {
        await ctx.db
          .update(billingEntitlements)
          .set({ plan: result.plan, source: 'licence', updatedAt: Date.now() })
          .where(eq(billingEntitlements.id, existing.id))
      } else {
        await ctx.db.insert(billingEntitlements).values({
          id: nanoid(),
          userId: input.userId,
          product: PRODUCT,
          plan: result.plan,
          source: 'licence',
          validUntil: null,
          updatedAt: Date.now(),
        })
      }

      await ctx.db.insert(billingEvents).values({
        id: nanoid(),
        product: PRODUCT,
        userId: input.userId,
        eventType: 'licence_activated',
        planFrom: 'free',
        planTo: result.plan,
        amountUsdCents: null,
        billingInterval: result.billingInterval,
        lsEventId: null,
        createdAt: Date.now(),
      })

      return { ok: true, plan: result.plan }
    }),

  deactivateLicence: publicProcedure
    .input(z.object({ licenceKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = await ctx.db
        .select()
        .from(licenceKeys)
        .where(eq(licenceKeys.lsLicenceKey, input.licenceKey))
        .get()

      if (!key) throw new TRPCError({ code: 'NOT_FOUND', message: 'Licence key not found' })
      if (!key.lsInstanceId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No instance ID' })

      await deactivateLicenceKey(input.licenceKey, key.lsInstanceId)

      await ctx.db
        .update(licenceKeys)
        .set({ status: 'deactivated', updatedAt: Date.now() })
        .where(eq(licenceKeys.lsLicenceKey, input.licenceKey))

      return { ok: true }
    }),

  // ── MRR (simple) ────────────────────────────────────────────────────────────

  getMrr: publicProcedure.query(async ({ ctx }) => {
    const subs = await ctx.db
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.product, PRODUCT),
          eq(billingSubscriptions.status, 'active'),
        ),
      )

    let mrr = 0
    for (const sub of subs) {
      const prices = PLAN_PRICES[sub.plan]
      if (!prices) continue
      if (sub.billingInterval === 'annual') {
        mrr += Math.round((prices['annual'] ?? 0) / 12)
      } else {
        mrr += prices['monthly'] ?? 0
      }
    }

    return {
      mrr,
      arr: mrr * 12,
      activeSubscriptions: subs.length,
      byPlan: subs.reduce<Record<string, number>>((acc, s) => {
        acc[s.plan] = (acc[s.plan] ?? 0) + 1
        return acc
      }, {}),
    }
  }),

  // ── Webhook dedup log ────────────────────────────────────────────────────────

  getWebhookEvents: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(billingWebhookEvents)
        .orderBy(desc(billingWebhookEvents.processedAt))
        .limit(input.limit)
    }),
})
