import { and, eq } from 'drizzle-orm'
import {
  getDb,
  nanoid,
  billingEntitlements,
  billingEvents,
  billingSubscriptions,
  billingWebhookEvents,
} from '@proxyos/db'
import { verifyWebhookSignature, parseWebhookPayload } from '@proxyos/billing'

export const runtime = 'nodejs'

const PRODUCT = process.env.HOMELABOS_PRODUCT ?? 'proxyos'

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-signature') ?? ''
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? ''

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const event = parseWebhookPayload(rawBody)
  if (!event) return new Response('Invalid payload', { status: 400 })

  const db = getDb()
  const eventName = event.meta.event_name
  const lsEntityId = event.data.id
  const eventId = `${eventName}:${lsEntityId}`

  // Idempotency — skip already-processed events
  const alreadyProcessed = await db
    .select()
    .from(billingWebhookEvents)
    .where(eq(billingWebhookEvents.eventId, eventId))
    .get()

  if (alreadyProcessed) return new Response('OK', { status: 200 })

  const customData = event.meta.custom_data ?? {}
  const product = (customData.product as string | undefined) ?? PRODUCT
  const userId = (customData.user_id as string | undefined) ?? ''
  const plan = (customData.plan as string | undefined) ?? 'solo'
  const attrs = event.data.attributes

  let processingError: string | null = null

  try {
    // ── Subscription created / updated ──────────────────────────────────────
    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      const email = (attrs.user_email as string) ?? ''
      const status = (attrs.status as string) ?? 'active'
      const portalUrl =
        ((attrs.urls as Record<string, unknown>)?.customer_portal as string) ?? null
      const periodStart = attrs.current_period_start
        ? new Date(attrs.current_period_start as string).getTime()
        : Date.now()
      const periodEnd = attrs.current_period_end
        ? new Date(attrs.current_period_end as string).getTime()
        : Date.now() + 30 * 86_400_000
      const trialEndsAt = attrs.trial_ends_at
        ? new Date(attrs.trial_ends_at as string).getTime()
        : null

      const existing = await db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.lsSubscriptionId, lsEntityId))
        .get()

      if (existing) {
        await db
          .update(billingSubscriptions)
          .set({
            status,
            lsCustomerPortalUrl: portalUrl,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            trialEndsAt,
            updatedAt: Date.now(),
          })
          .where(eq(billingSubscriptions.lsSubscriptionId, lsEntityId))
      } else {
        await db.insert(billingSubscriptions).values({
          id: nanoid(),
          product,
          userId,
          email,
          lsSubscriptionId: lsEntityId,
          lsCustomerId: String(attrs.customer_id ?? ''),
          lsOrderId: String(attrs.order_id ?? ''),
          lsVariantId: String(attrs.variant_id ?? ''),
          lsCustomerPortalUrl: portalUrl,
          plan,
          billingInterval: 'monthly',
          status,
          licenceType: 'cloud',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          trialEndsAt,
          cancelledAt: null,
          expiresAt: null,
          paymentFailedAt: null,
          dunningStep: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }

      // Upsert entitlement
      const entPlan = status === 'cancelled' || status === 'expired' ? 'free' : plan
      const entSource = entPlan === 'free' ? 'free' : 'subscription'
      const entExisting = await db
        .select()
        .from(billingEntitlements)
        .where(
          and(
            eq(billingEntitlements.userId, userId),
            eq(billingEntitlements.product, product),
          ),
        )
        .get()

      if (entExisting) {
        await db
          .update(billingEntitlements)
          .set({ plan: entPlan, source: entSource, updatedAt: Date.now() })
          .where(eq(billingEntitlements.id, entExisting.id))
      } else if (userId) {
        await db.insert(billingEntitlements).values({
          id: nanoid(),
          userId,
          product,
          plan: entPlan,
          source: entSource,
          validUntil: null,
          updatedAt: Date.now(),
        })
      }

      if (eventName === 'subscription_created') {
        await db.insert(billingEvents).values({
          id: nanoid(),
          product,
          userId,
          eventType: 'subscription_created',
          planFrom: 'free',
          planTo: plan,
          amountUsdCents: null,
          billingInterval: null,
          lsEventId: eventId,
          createdAt: Date.now(),
        })
      }
    }

    // ── Subscription cancelled ───────────────────────────────────────────────
    if (eventName === 'subscription_cancelled') {
      await db
        .update(billingSubscriptions)
        .set({ status: 'cancelled', cancelledAt: Date.now(), updatedAt: Date.now() })
        .where(eq(billingSubscriptions.lsSubscriptionId, lsEntityId))

      if (userId) {
        await db
          .update(billingEntitlements)
          .set({ plan: 'free', source: 'free', updatedAt: Date.now() })
          .where(
            and(
              eq(billingEntitlements.userId, userId),
              eq(billingEntitlements.product, product),
            ),
          )
      }
    }

    // ── Subscription expired ─────────────────────────────────────────────────
    if (eventName === 'subscription_expired') {
      await db
        .update(billingSubscriptions)
        .set({ status: 'expired', expiresAt: Date.now(), updatedAt: Date.now() })
        .where(eq(billingSubscriptions.lsSubscriptionId, lsEntityId))
    }

    // ── Payment failed — start dunning ───────────────────────────────────────
    if (eventName === 'subscription_payment_failed') {
      const sub = await db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.lsSubscriptionId, lsEntityId))
        .get()
      await db
        .update(billingSubscriptions)
        .set({
          paymentFailedAt: Date.now(),
          dunningStep: (sub?.dunningStep ?? 0) + 1,
          status: 'past_due',
          updatedAt: Date.now(),
        })
        .where(eq(billingSubscriptions.lsSubscriptionId, lsEntityId))
    }

    // ── Payment recovered ────────────────────────────────────────────────────
    if (eventName === 'subscription_payment_recovered') {
      await db
        .update(billingSubscriptions)
        .set({
          paymentFailedAt: null,
          dunningStep: 0,
          status: 'active',
          updatedAt: Date.now(),
        })
        .where(eq(billingSubscriptions.lsSubscriptionId, lsEntityId))
    }

    // ── Payment success ──────────────────────────────────────────────────────
    if (eventName === 'subscription_payment_success') {
      const amountCents = attrs.total
        ? Math.round(Number(attrs.total) * 100)
        : null
      await db.insert(billingEvents).values({
        id: nanoid(),
        product,
        userId,
        eventType: 'payment_success',
        planFrom: null,
        planTo: null,
        amountUsdCents: amountCents,
        billingInterval: null,
        lsEventId: eventId,
        createdAt: Date.now(),
      })
    }
  } catch (err) {
    processingError = String(err)
    console.error(`[billing-webhook] Error processing ${eventName}:`, err)
  }

  // Record webhook event (success or failure)
  await db
    .insert(billingWebhookEvents)
    .values({
      id: nanoid(),
      eventId,
      eventName,
      product: product ?? null,
      payload: rawBody,
      processedAt: Date.now(),
      error: processingError,
    })
    .catch(() => {})

  if (processingError) return new Response('Processing error', { status: 500 })
  return new Response('OK', { status: 200 })
}
