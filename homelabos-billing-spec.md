# Homelab OS — Unified Store & Billing Spec
## All OS Family Products · Single Lemon Squeezy Store

**Version:** 1.0  
**Date:** April 2026  
**Store:** homelabos.lemonsqueezy.com  
**Umbrella brand:** Homelab OS (homelabos.app)  
**Products in store:** MxWatch · ProxyOS · BackupOS · InfraOS · LockBoxOS · PatchOS · AccessOS

---

## Why One Store

One Lemon Squeezy store means:
- Single merchant of record covering all products
- One payout, one tax remittance, one financial entity
- Customers can manage all their Homelab OS subscriptions from one portal URL
- Cross-sell and bundle pricing possible (e.g. "All products" tier)
- One set of API keys, one webhook endpoint fan-out
- Consistent checkout branding across every product

The store is `Homelab OS` — individual products are presented as distinct offerings within it. A customer buying ProxyOS Cloud sees "ProxyOS Cloud Solo — by Homelab OS" in their LS receipt.

---

## Table of Contents

1. [Store Configuration](#1-store-configuration)
2. [Product Catalogue](#2-product-catalogue)
3. [Variant IDs & Environment Variables](#3-variant-ids--environment-variables)
4. [Checkout Flow — Per Product](#4-checkout-flow--per-product)
5. [Webhook Architecture — Fan-out](#5-webhook-architecture--fan-out)
6. [Shared Billing Package](#6-shared-billing-package)
7. [Database Schema — Multi-product](#7-database-schema--multi-product)
8. [Customer Portal](#8-customer-portal)
9. [Entitlement System — Cross-product](#9-entitlement-system--cross-product)
10. [Bundle Pricing](#10-bundle-pricing)
11. [Revenue Reporting — Per Product & Consolidated](#11-revenue-reporting--per-product--consolidated)
12. [Self-Hosted Licences](#12-self-hosted-licences)
13. [Trial System](#13-trial-system)
14. [Dunning & Failed Payments](#14-dunning--failed-payments)
15. [Tax & Compliance](#15-tax--compliance)
16. [Environment Variables](#16-environment-variables)
17. [Monorepo Integration](#17-monorepo-integration)
18. [Build Order](#18-build-order)

---

---

## 1. Store Configuration

```
Store name:       Homelab OS
Store slug:       homelabos
Store URL:        https://homelabos.lemonsqueezy.com
Support email:    billing@homelabos.app
Logo:             Homelab OS umbrella mark (512×512)
Brand colour:     #0F0D22  (dark — neutral, not product-specific)
Button colour:    #4338CA  (shared action purple across all products)
```

### Checkout URLs (per product)

Each product has its own success and cancel URL so the post-checkout experience is product-specific:

| Product | Success URL | Cancel URL |
|---|---|---|
| MxWatch | `https://app.mxwatch.app/billing/success` | `https://app.mxwatch.app/billing` |
| ProxyOS | `https://app.proxyos.app/billing/success` | `https://app.proxyos.app/billing` |
| BackupOS | `https://app.backupos.app/billing/success` | `https://app.backupos.app/billing` |
| InfraOS | `https://app.infraos.app/billing/success` | `https://app.infraos.app/billing` |
| LockBoxOS | `https://app.lockboxos.app/billing/success` | `https://app.lockboxos.app/billing` |
| PatchOS | `https://app.patchos.app/billing/success` | `https://app.patchos.app/billing` |
| AccessOS | `https://app.accessos.app/billing/success` | `https://app.accessos.app/billing` |
| Bundle | `https://homelabos.app/billing/success` | `https://homelabos.app/billing` |

These are set per checkout session creation, not per product in LS. Each product's app server passes its own redirect URL when creating a checkout.

---

---

## 2. Product Catalogue

Every product follows the same pricing model: **$9/mo Solo · $29/mo Teams** with annual variants (2 months free).

### Naming convention in Lemon Squeezy

```
{Product Name} Cloud Solo
{Product Name} Cloud Teams
{Product Name} Self-Hosted Pro
{Product Name} Self-Hosted Teams
```

### Full product list

#### MxWatch

```
MxWatch Cloud Solo          $9/mo   or  $90/yr
MxWatch Cloud Teams         $29/mo  or  $290/yr
MxWatch Self-Hosted Pro     $9/mo   or  $90/yr   (licence key)
MxWatch Self-Hosted Teams   $29/mo  or  $290/yr  (licence key)
```

#### ProxyOS

```
ProxyOS Cloud Solo          $9/mo   or  $90/yr
ProxyOS Cloud Teams         $29/mo  or  $290/yr
ProxyOS Self-Hosted Pro     $9/mo   or  $90/yr   (licence key)
ProxyOS Self-Hosted Teams   $29/mo  or  $290/yr  (licence key)
```

#### BackupOS

```
BackupOS Cloud Solo         $9/mo   or  $90/yr
BackupOS Cloud Teams        $29/mo  or  $290/yr
BackupOS Self-Hosted Pro    $9/mo   or  $90/yr   (licence key)
BackupOS Self-Hosted Teams  $29/mo  or  $290/yr  (licence key)
```

#### InfraOS

```
InfraOS Cloud Solo          $9/mo   or  $90/yr
InfraOS Cloud Teams         $29/mo  or  $290/yr
InfraOS Self-Hosted Pro     $9/mo   or  $90/yr   (licence key)
InfraOS Self-Hosted Teams   $29/mo  or  $290/yr  (licence key)
```

#### LockBoxOS

```
LockBoxOS Cloud Solo        $9/mo   or  $90/yr
LockBoxOS Cloud Teams       $29/mo  or  $290/yr
LockBoxOS Self-Hosted Pro   $9/mo   or  $90/yr   (licence key)
LockBoxOS Self-Hosted Teams $29/mo  or  $290/yr  (licence key)
```

#### PatchOS

```
PatchOS Cloud Solo          $9/mo   or  $90/yr
PatchOS Cloud Teams         $29/mo  or  $290/yr
PatchOS Self-Hosted Pro     $9/mo   or  $90/yr   (licence key)
PatchOS Self-Hosted Teams   $29/mo  or  $290/yr  (licence key)
```

#### AccessOS

```
AccessOS Cloud Solo         $9/mo   or  $90/yr   (maps to $0/$19/$49/$199 per-instance tiers — see note)
AccessOS Cloud Teams        $29/mo  or  $290/yr
AccessOS Self-Hosted Pro    $9/mo   or  $90/yr   (licence key)
AccessOS Self-Hosted Teams  $29/mo  or  $290/yr  (licence key)
```

*Note: AccessOS has its own per-instance pricing tier structure ($0/$19/$49/$199). These are additional variants on the AccessOS product. The $9/$29 Solo/Teams maps to their "Starter" and "Growth" tiers. Spec separately when AccessOS is built.*

#### Homelab OS Bundle (see Section 10)

```
Homelab OS Bundle Solo      $39/mo  or  $390/yr  (all 7 products Solo — saves $24/mo vs individual)
Homelab OS Bundle Teams     $99/mo  or  $990/yr  (all 7 products Teams — saves $104/mo vs individual)
```

### Total variant count

7 products × 4 variants (solo monthly/annual + teams monthly/annual) = **28 product variants** + 4 self-hosted variants per product = **56 total variants** + 4 bundle variants = **60 variants** in the store.

---

---

## 3. Variant IDs & Environment Variables

All variant IDs are stored in a single shared environment file consumed by all product apps and the central billing service.

```env
# ─── MXWATCH ──────────────────────────────────────────────
MXWATCH_SOLO_MONTHLY_VARIANT_ID=
MXWATCH_SOLO_ANNUAL_VARIANT_ID=
MXWATCH_TEAMS_MONTHLY_VARIANT_ID=
MXWATCH_TEAMS_ANNUAL_VARIANT_ID=
MXWATCH_SH_PRO_MONTHLY_VARIANT_ID=
MXWATCH_SH_PRO_ANNUAL_VARIANT_ID=
MXWATCH_SH_TEAMS_MONTHLY_VARIANT_ID=
MXWATCH_SH_TEAMS_ANNUAL_VARIANT_ID=

# ─── PROXYOS ──────────────────────────────────────────────
PROXYOS_SOLO_MONTHLY_VARIANT_ID=
PROXYOS_SOLO_ANNUAL_VARIANT_ID=
PROXYOS_TEAMS_MONTHLY_VARIANT_ID=
PROXYOS_TEAMS_ANNUAL_VARIANT_ID=
PROXYOS_SH_PRO_MONTHLY_VARIANT_ID=
PROXYOS_SH_PRO_ANNUAL_VARIANT_ID=
PROXYOS_SH_TEAMS_MONTHLY_VARIANT_ID=
PROXYOS_SH_TEAMS_ANNUAL_VARIANT_ID=

# ─── BACKUPOS ─────────────────────────────────────────────
BACKUPOS_SOLO_MONTHLY_VARIANT_ID=
BACKUPOS_SOLO_ANNUAL_VARIANT_ID=
BACKUPOS_TEAMS_MONTHLY_VARIANT_ID=
BACKUPOS_TEAMS_ANNUAL_VARIANT_ID=
BACKUPOS_SH_PRO_MONTHLY_VARIANT_ID=
BACKUPOS_SH_PRO_ANNUAL_VARIANT_ID=
BACKUPOS_SH_TEAMS_MONTHLY_VARIANT_ID=
BACKUPOS_SH_TEAMS_ANNUAL_VARIANT_ID=

# ─── INFRAOS ──────────────────────────────────────────────
INFRAOS_SOLO_MONTHLY_VARIANT_ID=
INFRAOS_SOLO_ANNUAL_VARIANT_ID=
INFRAOS_TEAMS_MONTHLY_VARIANT_ID=
INFRAOS_TEAMS_ANNUAL_VARIANT_ID=
INFRAOS_SH_PRO_MONTHLY_VARIANT_ID=
INFRAOS_SH_PRO_ANNUAL_VARIANT_ID=
INFRAOS_SH_TEAMS_MONTHLY_VARIANT_ID=
INFRAOS_SH_TEAMS_ANNUAL_VARIANT_ID=

# ─── LOCKBOXOS ────────────────────────────────────────────
LOCKBOXOS_SOLO_MONTHLY_VARIANT_ID=
LOCKBOXOS_SOLO_ANNUAL_VARIANT_ID=
LOCKBOXOS_TEAMS_MONTHLY_VARIANT_ID=
LOCKBOXOS_TEAMS_ANNUAL_VARIANT_ID=
LOCKBOXOS_SH_PRO_MONTHLY_VARIANT_ID=
LOCKBOXOS_SH_PRO_ANNUAL_VARIANT_ID=
LOCKBOXOS_SH_TEAMS_MONTHLY_VARIANT_ID=
LOCKBOXOS_SH_TEAMS_ANNUAL_VARIANT_ID=

# ─── PATCHOS ──────────────────────────────────────────────
PATCHOS_SOLO_MONTHLY_VARIANT_ID=
PATCHOS_SOLO_ANNUAL_VARIANT_ID=
PATCHOS_TEAMS_MONTHLY_VARIANT_ID=
PATCHOS_TEAMS_ANNUAL_VARIANT_ID=
PATCHOS_SH_PRO_MONTHLY_VARIANT_ID=
PATCHOS_SH_PRO_ANNUAL_VARIANT_ID=
PATCHOS_SH_TEAMS_MONTHLY_VARIANT_ID=
PATCHOS_SH_TEAMS_ANNUAL_VARIANT_ID=

# ─── ACCESSOS ─────────────────────────────────────────────
ACCESSOS_SOLO_MONTHLY_VARIANT_ID=
ACCESSOS_SOLO_ANNUAL_VARIANT_ID=
ACCESSOS_TEAMS_MONTHLY_VARIANT_ID=
ACCESSOS_TEAMS_ANNUAL_VARIANT_ID=
ACCESSOS_SH_PRO_MONTHLY_VARIANT_ID=
ACCESSOS_SH_PRO_ANNUAL_VARIANT_ID=
ACCESSOS_SH_TEAMS_MONTHLY_VARIANT_ID=
ACCESSOS_SH_TEAMS_ANNUAL_VARIANT_ID=

# ─── BUNDLE ───────────────────────────────────────────────
BUNDLE_SOLO_MONTHLY_VARIANT_ID=
BUNDLE_SOLO_ANNUAL_VARIANT_ID=
BUNDLE_TEAMS_MONTHLY_VARIANT_ID=
BUNDLE_TEAMS_ANNUAL_VARIANT_ID=

# ─── STORE ────────────────────────────────────────────────
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_STORE_ID=
```

### Variant lookup utility

```typescript
// packages/billing/variants.ts

type Product = 'mxwatch' | 'proxyos' | 'backupos' | 'infraos' | 'lockboxos' | 'patchos' | 'accessos' | 'bundle'
type Plan = 'solo' | 'teams'
type Interval = 'monthly' | 'annual'
type LicenceType = 'cloud' | 'sh_pro' | 'sh_teams'

function getVariantId(
  product: Product,
  plan: Plan,
  interval: Interval,
  licenceType: LicenceType = 'cloud'
): string {
  const prefix = product.toUpperCase()
  const planKey = licenceType === 'cloud'
    ? plan.toUpperCase()
    : licenceType === 'sh_pro' ? 'SH_PRO' : 'SH_TEAMS'
  const intervalKey = interval.toUpperCase()

  const envKey = `${prefix}_${planKey}_${intervalKey}_VARIANT_ID`
  const variantId = process.env[envKey]

  if (!variantId) throw new Error(`Missing variant ID env var: ${envKey}`)
  return variantId
}

// Usage:
// getVariantId('proxyos', 'solo', 'monthly')           → PROXYOS_SOLO_MONTHLY_VARIANT_ID
// getVariantId('mxwatch', 'teams', 'annual')           → MXWATCH_TEAMS_ANNUAL_VARIANT_ID
// getVariantId('proxyos', 'solo', 'monthly', 'sh_pro') → PROXYOS_SH_PRO_MONTHLY_VARIANT_ID

function deriveProductFromVariantId(variantId: string): { product: Product, plan: Plan, interval: Interval } {
  // Reverse lookup — iterate all env vars to find matching variant ID
  // Used in webhook handlers to identify which product an event belongs to
  const allVariants = buildVariantMap()
  const match = allVariants.find(v => v.variantId === variantId)
  if (!match) throw new Error(`Unknown variant ID: ${variantId}`)
  return match
}
```

---

---

## 4. Checkout Flow — Per Product

Each product app creates its own checkout session, but routes through the shared `packages/billing` package. The `product` identifier is passed in `custom_data` so the webhook handler knows which product to activate.

```typescript
// packages/billing/checkout.ts

interface CreateCheckoutInput {
  product: Product
  plan: Plan
  interval: Interval
  licenceType?: LicenceType
  userId: string
  userEmail: string
  orgId?: string
  successUrl: string    // product-specific
  cancelUrl: string     // product-specific
}

async function createCheckout(input: CreateCheckoutInput): Promise<string> {
  const variantId = getVariantId(
    input.product,
    input.plan,
    input.interval,
    input.licenceType
  )

  const response = await lsClient.post('/v1/checkouts', {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: input.userEmail,
          custom: {
            user_id: input.userId,
            product: input.product,       // 'proxyos' | 'mxwatch' | etc.
            plan: input.plan,             // 'solo' | 'teams'
            interval: input.interval,     // 'monthly' | 'annual'
            licence_type: input.licenceType ?? 'cloud',
            org_id: input.orgId ?? null
          } satisfies CheckoutCustomData
        },
        product_options: {
          redirect_url: input.successUrl,
          receipt_link_url: input.cancelUrl,
          receipt_thank_you_note: `Thank you for subscribing to ${productDisplayName(input.product)}!`
        },
        checkout_options: {
          dark: true,
          logo: true
        }
      },
      relationships: {
        variant: { data: { type: 'variants', id: variantId } }
      }
    }
  })

  return response.data.attributes.url
}
```

Each product app calls this from its own tRPC billing router:

```typescript
// apps/proxyos-web/src/server/routers/billing.ts
billing.createCheckout.use(async ({ ctx, input, next }) => {
  const url = await createCheckout({
    product: 'proxyos',
    plan: input.plan,
    interval: input.interval,
    userId: ctx.userId,
    userEmail: ctx.user.email,
    successUrl: 'https://app.proxyos.app/billing/success',
    cancelUrl: 'https://app.proxyos.app/billing'
  })
  return { checkoutUrl: url }
})
```

---

---

## 5. Webhook Architecture — Fan-out

A single Lemon Squeezy store has one webhook endpoint. Since all products share this store, all billing events arrive at one endpoint and are routed to the correct product handler based on the `product` field in `custom_data`.

### Webhook endpoint

The webhook endpoint lives in the central Homelab OS billing service — **not** in any individual product app.

```
POST https://billing.homelabos.app/webhooks/lemonsqueezy
```

This is a dedicated lightweight service (or Next.js API route on the homelabos.app hub) that:
1. Verifies the LS signature
2. Extracts `meta.custom_data.product`
3. Routes to the correct product handler
4. Returns 200

### Fan-out router

```typescript
// services/billing-hub/src/webhook-router.ts

async function routeWebhookEvent(event: LemonSqueezyEvent): Promise<void> {
  // Extract which product this event belongs to
  const customData = event.meta.custom_data as CheckoutCustomData
  const product = customData?.product

  if (!product) {
    // Events without custom_data (e.g. some order_refunded events) —
    // look up from subscription/order records
    const resolvedProduct = await resolveProductFromOrderId(event.data.attributes.order_id)
    return routeToProductHandler(resolvedProduct, event)
  }

  return routeToProductHandler(product, event)
}

async function routeToProductHandler(
  product: Product,
  event: LemonSqueezyEvent
): Promise<void> {
  switch (product) {
    case 'mxwatch':    return mxwatchBillingHandler.handle(event)
    case 'proxyos':    return proxyosBillingHandler.handle(event)
    case 'backupos':   return backuposBillingHandler.handle(event)
    case 'infraos':    return infraosBillingHandler.handle(event)
    case 'lockboxos':  return lockboxosBillingHandler.handle(event)
    case 'patchos':    return patchosBillingHandler.handle(event)
    case 'accessos':   return accessosBillingHandler.handle(event)
    case 'bundle':     return bundleBillingHandler.handle(event)
    default:
      console.error(`Unknown product in webhook: ${product}`)
  }
}
```

### Product handlers

Each product has its own handler that talks to its own database. Since each product is a separate deployed app with its own SQLite DB, the billing hub calls internal APIs (or shares a database layer for cloud deployments where all products share one Postgres instance).

```typescript
// For cloud deployments — shared Postgres, product namespace via column
// For self-hosted — each product has its own SQLite, billing hub calls product API

interface ProductBillingHandler {
  handle(event: LemonSqueezyEvent): Promise<void>
  activateSubscription(event: LemonSqueezyEvent): Promise<void>
  updateSubscription(event: LemonSqueezyEvent): Promise<void>
  cancelSubscription(event: LemonSqueezyEvent): Promise<void>
  expireSubscription(event: LemonSqueezyEvent): Promise<void>
  failPayment(event: LemonSqueezyEvent): Promise<void>
  recoverPayment(event: LemonSqueezyEvent): Promise<void>
}
```

### Fallback: product apps also accept direct webhook calls

For resilience, each product app also has its own webhook endpoint (`POST /api/billing/webhook`) that accepts LS events. If the billing hub is down, LS can be configured to call product endpoints directly. This is the backup — primary path is always through the hub.

---

---

## 6. Shared Billing Package

All products import from `packages/billing` — a shared monorepo package.

```
packages/billing/
├── src/
│   ├── client.ts          # Lemon Squeezy API client (typed)
│   ├── checkout.ts        # createCheckout() — shared by all products
│   ├── variants.ts        # getVariantId(), deriveProductFromVariantId()
│   ├── webhook.ts         # verifyWebhookSignature(), processWebhook()
│   ├── handlers/
│   │   ├── subscription.ts  # activateSubscription, cancel, expire, etc.
│   │   ├── licence.ts       # activateLicenceKey, validateLicenceKey, deactivate
│   │   └── dunning.ts       # dunning state machine
│   ├── entitlements.ts    # getEntitlements(), checkFeature()
│   ├── portal.ts          # getCustomerPortalUrl()
│   ├── mrr.ts             # MRR calculations
│   └── types.ts           # All shared billing types
└── package.json
```

Each product app imports only what it needs:

```typescript
import {
  createCheckout,
  getEntitlements,
  requireEntitlement,
  getCustomerPortalUrl,
  activateLicenceKey
} from '@homelabos/billing'
```

---

---

## 7. Database Schema — Multi-product

For the cloud hosted tier, all products share a central Postgres database on the billing hub. Each table has a `product` column.

For self-hosted, each product has its own SQLite with only its own billing tables — no cross-product data.

### Cloud (Postgres — shared)

```sql
-- One subscriptions table for all products
CREATE TABLE subscriptions (
  id                      TEXT PRIMARY KEY,
  product                 TEXT NOT NULL,    -- 'mxwatch' | 'proxyos' | etc. | 'bundle'
  user_id                 TEXT NOT NULL,
  org_id                  TEXT,
  email                   TEXT NOT NULL,

  -- Lemon Squeezy
  ls_subscription_id      TEXT NOT NULL UNIQUE,
  ls_customer_id          TEXT NOT NULL,
  ls_order_id             TEXT NOT NULL,
  ls_variant_id           TEXT NOT NULL,
  ls_customer_portal_url  TEXT,

  -- Plan
  plan                    TEXT NOT NULL,    -- 'solo' | 'teams'
  billing_interval        TEXT NOT NULL,    -- 'monthly' | 'annual'
  status                  TEXT NOT NULL DEFAULT 'active',
  licence_type            TEXT NOT NULL DEFAULT 'cloud',  -- 'cloud' | 'sh_pro' | 'sh_teams'

  -- Dates
  current_period_start    BIGINT NOT NULL,
  current_period_end      BIGINT NOT NULL,
  trial_ends_at           BIGINT,
  cancelled_at            BIGINT,
  expires_at              BIGINT,
  payment_failed_at       BIGINT,
  dunning_step            INTEGER DEFAULT 0,

  created_at              BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL
);

CREATE INDEX idx_subscriptions_user_product ON subscriptions(user_id, product);
CREATE INDEX idx_subscriptions_ls_id ON subscriptions(ls_subscription_id);

-- One entitlements table — one row per user per product
CREATE TABLE entitlements (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  product                 TEXT NOT NULL,
  plan                    TEXT NOT NULL,    -- 'free' | 'solo' | 'teams' | 'bundle'
  source                  TEXT NOT NULL,    -- 'subscription' | 'licence' | 'bundle' | 'free'
  valid_until             BIGINT,           -- null = no expiry
  updated_at              BIGINT NOT NULL,

  UNIQUE(user_id, product)
);

-- Licence keys (self-hosted)
CREATE TABLE licence_keys (
  id                      TEXT PRIMARY KEY,
  product                 TEXT NOT NULL,
  purchaser_email         TEXT NOT NULL,
  ls_licence_key          TEXT NOT NULL UNIQUE,
  ls_order_id             TEXT NOT NULL,
  ls_variant_id           TEXT NOT NULL,
  ls_instance_id          TEXT,
  plan                    TEXT NOT NULL,    -- 'pro' | 'teams'
  billing_interval        TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'inactive',
  instance_name           TEXT,
  last_validated_at       BIGINT,
  validation_failures     INTEGER DEFAULT 0,
  grace_period_until      BIGINT,
  expires_at              BIGINT,
  created_at              BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL
);

-- Webhook events (shared — deduplication across all products)
CREATE TABLE webhook_events (
  id                      TEXT PRIMARY KEY,
  event_id                TEXT NOT NULL UNIQUE,
  event_name              TEXT NOT NULL,
  product                 TEXT,
  payload                 TEXT NOT NULL,
  processed_at            BIGINT NOT NULL,
  error                   TEXT
);

-- Billing events (audit trail — all products)
CREATE TABLE billing_events (
  id                      TEXT PRIMARY KEY,
  product                 TEXT NOT NULL,
  user_id                 TEXT NOT NULL,
  event_type              TEXT NOT NULL,
  plan_from               TEXT,
  plan_to                 TEXT,
  amount_usd_cents        INTEGER,
  billing_interval        TEXT,
  ls_event_id             TEXT,
  created_at              BIGINT NOT NULL
);

CREATE INDEX idx_billing_events_product ON billing_events(product);
CREATE INDEX idx_billing_events_user ON billing_events(user_id);
CREATE INDEX idx_billing_events_created ON billing_events(created_at);
```

---

---

## 8. Customer Portal

One Lemon Squeezy customer account can hold subscriptions to multiple Homelab OS products. When a customer clicks "Manage billing" in any product, they're taken to the same LS customer portal — they can see and manage all their Homelab OS subscriptions from that single portal page.

```typescript
// packages/billing/portal.ts

async function getCustomerPortalUrl(lsCustomerId: string): Promise<string> {
  const customer = await lsClient.get(`/v1/customers/${lsCustomerId}`)
  return customer.data.attributes.urls.customer_portal
}

// Each product surfaces this as "Manage billing" in Settings → Billing
// The same portal URL works regardless of which product the user is in
```

### Cross-product billing page — homelabos.app/billing

The `homelabos.app` hub site has a consolidated billing page where users can see all their subscriptions across all products:

```
Your Homelab OS subscriptions

  MxWatch          Solo     Active     $9/mo     Next: May 16 ▸
  ProxyOS          Teams    Active     $29/mo    Next: May 16 ▸
  BackupOS         —        Free       —         [Upgrade]
  InfraOS          —        Free       —         [Upgrade]

  [Manage all billing →]    ← LS customer portal
```

---

---

## 9. Entitlement System — Cross-product

### Entitlement lookup

Each product app calls `getEntitlements(userId, product)` — a shared function that returns the entitlements for that specific product.

```typescript
// packages/billing/entitlements.ts

interface Entitlements {
  product: Product
  plan: 'free' | 'solo' | 'teams' | 'bundle'
  source: 'subscription' | 'licence' | 'bundle' | 'free'
  validUntil: number | null

  // Feature flags — derived from plan
  connectionsEnabled: boolean
  apiEnabled: boolean
  teamsEnabled: boolean
  agentsLimit: number           // -1 = unlimited
  analyticsRetentionDays: number
  routeTemplatesLimit: number   // -1 = unlimited
}

async function getEntitlements(
  userId: string,
  product: Product
): Promise<Entitlements> {
  // 1. Check entitlements cache table (fast path)
  const cached = await db.query.entitlements.findFirst({
    where: and(
      eq(entitlements.userId, userId),
      eq(entitlements.product, product)
    )
  })

  // If cache is fresh (updated < 5 min ago), return it
  if (cached && Date.now() - cached.updatedAt < 5 * 60 * 1000) {
    return deriveEntitlementFeatures(cached)
  }

  // 2. Recompute from subscription/licence tables
  const computed = await computeEntitlements(userId, product)

  // 3. Update cache
  await upsertEntitlementCache(userId, product, computed)

  return computed
}
```

### Bundle entitlement expansion

When a user has a Bundle subscription, `getEntitlements` returns the Teams-level entitlements for every product:

```typescript
async function computeEntitlements(
  userId: string,
  product: Product
): Promise<Entitlements> {
  // Check for active bundle subscription first — overrides everything
  const bundle = await getActiveSubscription(userId, 'bundle')
  if (bundle) {
    return {
      product,
      plan: 'bundle',
      source: 'bundle',
      validUntil: bundle.currentPeriodEnd,
      connectionsEnabled: true,
      apiEnabled: true,
      teamsEnabled: bundle.plan === 'teams',
      agentsLimit: -1,
      analyticsRetentionDays: 90,
      routeTemplatesLimit: -1
    }
  }

  // Check product-specific subscription
  const sub = await getActiveSubscription(userId, product)
  if (sub) return subscriptionToEntitlements(sub)

  // Check self-hosted licence
  const licence = await getActiveLicence(userId, product)
  if (licence) return licenceToEntitlements(licence)

  // Default: free tier
  return freeEntitlements(product)
}
```

---

---

## 10. Bundle Pricing

The Homelab OS Bundle gives access to all 7 products at a significant discount.

### Bundle pricing

| Bundle | Monthly | Annual | Savings vs individual monthly |
|---|---|---|---|
| Bundle Solo | $39/mo | $390/yr | $24/mo (7 × $9 = $63, save 38%) |
| Bundle Teams | $99/mo | $990/yr | $104/mo (7 × $29 = $203, save 51%) |

### Bundle page — homelabos.app/pricing

The bundle is sold from the homelabos.app hub, not from individual product pages. Individual product pages can link to it as "Save more with the Homelab OS Bundle".

### Bundle activation

When a bundle subscription is created, the billing hub activates entitlements for all 7 products simultaneously:

```typescript
// services/billing-hub/src/handlers/bundle.ts

async function activateBundleSubscription(event: LemonSqueezyEvent): Promise<void> {
  const customData = event.meta.custom_data as CheckoutCustomData
  const userId = customData.user_id
  const plan = customData.plan  // 'solo' or 'teams'

  const allProducts: Product[] = [
    'mxwatch', 'proxyos', 'backupos', 'infraos',
    'lockboxos', 'patchos', 'accessos'
  ]

  // Activate entitlements for every product
  await Promise.all(
    allProducts.map(product =>
      upsertEntitlementCache(userId, product, {
        plan: 'bundle',
        source: 'bundle',
        validUntil: event.data.attributes.ends_at
          ? new Date(event.data.attributes.ends_at).getTime()
          : null,
        connectionsEnabled: true,
        apiEnabled: true,
        teamsEnabled: plan === 'teams',
        agentsLimit: -1,
        analyticsRetentionDays: 90,
        routeTemplatesLimit: -1
      })
    )
  )

  // Store one subscription record with product = 'bundle'
  await createSubscriptionRecord(userId, 'bundle', event)
}
```

### Upgrading from individual to bundle

If a user already has individual product subscriptions and buys the bundle:
1. Bundle subscription activates — entitlements immediately update to bundle level
2. Individual subscriptions are cancelled at their current period end (user not double-billed)
3. No refunds for unused individual subscription time — upgrade is additive

---

---

## 11. Revenue Reporting — Per Product & Consolidated

The billing hub maintains a consolidated revenue view across all products.

### MRR breakdown

```typescript
// services/billing-hub/src/mrr.ts

interface MRRBreakdown {
  total: number
  byProduct: Record<Product, number>
  byPlan: {
    solo_monthly: number
    solo_annual_monthly_equiv: number
    teams_monthly: number
    teams_annual_monthly_equiv: number
    bundle_solo_monthly: number
    bundle_teams_monthly: number
  }
  newMRR: number        // new subscriptions this month
  churnedMRR: number    // cancelled subscriptions this month
  expansionMRR: number  // upgrades (solo → teams, individual → bundle)
  contractionMRR: number // downgrades
  netNewMRR: number     // new + expansion - churned - contraction
}

async function calculateMRR(asOf?: Date): Promise<MRRBreakdown>
```

### Admin dashboard — homelabos.app/admin

Cross-product revenue dashboard (admin-only):

```
Homelab OS — Revenue Dashboard

Total MRR:         $X,XXX
ARR:               $XX,XXX
Net new MRR:       +$XXX this month

By product:
  MxWatch          $XXX/mo    XX subscribers
  ProxyOS          $XXX/mo    XX subscribers
  BackupOS         $XXX/mo    XX subscribers
  InfraOS          $XXX/mo    XX subscribers
  LockBoxOS        $XXX/mo    XX subscribers
  PatchOS          $XXX/mo    XX subscribers
  AccessOS         $XXX/mo    XX subscribers
  Bundle Solo      $XXX/mo    XX subscribers
  Bundle Teams     $XXX/mo    XX subscribers

Charts:
  - MRR over time (stacked by product)
  - New subscribers per day
  - Churn rate per product
  - Trial conversion rate
  - Annual vs monthly split
```

---

---

## 12. Self-Hosted Licences

Same as the ProxyOS billing spec (Section 7) — applies identically to all products.

Each product app activates its licence against the LS Licence API independently. The `packages/billing` shared package provides `activateLicenceKey`, `validateLicenceKey`, and `deactivateLicenceKey` — each product calls them with its own product-specific LS licence key.

Licence keys from the store are product-specific — a ProxyOS licence key cannot activate BackupOS features. The product is embedded in the LS product configuration.

### Self-hosted licence validation job

Each product app runs its own 24h validation cron. Uses the shared `validateLicenceKey` function.

```typescript
// In each product's node-cron setup:
cron.schedule('0 3 * * *', async () => {
  // Run at 3am daily — staggered per product to avoid LS API rate limits
  await validateAllActiveLicences('proxyos')
})
```

Suggested cron stagger:
- MxWatch: `0 3 * * *` (3:00am)
- ProxyOS: `0 3:30 * * *` (3:30am)
- BackupOS: `0 4 * * *` (4:00am)
- InfraOS: `0 4:30 * * *` (4:30am)
- LockBoxOS: `0 5 * * *` (5:00am)
- PatchOS: `0 5:30 * * *` (5:30am)
- AccessOS: `0 6 * * *` (6:00am)

---

---

## 13. Trial System

All cloud products offer a **14-day free trial** — card required at checkout, not charged until trial ends.

Trial period is consistent across all products. A user who trials MxWatch, then trials ProxyOS, gets 14 days on each (trials are per-product, not per-account).

Trial entitlements: full Teams-level features during trial regardless of which plan was selected. This maximises perceived value and reduces friction.

```typescript
// When creating a trial checkout:
checkout_options: {
  subscription_trial_end: Math.floor(
    (Date.now() + 14 * 24 * 60 * 60 * 1000) / 1000
  ).toString()
}
```

---

---

## 14. Dunning & Failed Payments

Shared dunning logic across all products. The dunning state machine in `packages/billing/handlers/dunning.ts` is product-agnostic — it takes a subscription record and handles the state transitions regardless of which product it belongs to.

Email templates are product-branded but use the same structure:

```
Subject: Action required: your {Product Name} payment failed

Hi {name},

Your payment of ${amount} for {Product Name} {Plan} failed on {date}.

Please update your payment method to keep your access active.

[Update payment method →]

Your access will remain active until {grace_end_date}.

— The Homelab OS team
```

Each product has its own branded email template with the correct product name, accent colour, and logo. The underlying logic (retry schedule, dunning steps, expiry) is identical.

---

---

## 15. Tax & Compliance

Lemon Squeezy as merchant of record handles all tax for all products in the store. One store = one MoR = unified tax handling.

- All products in the store benefit from LS's tax registrations globally
- Customers receive LS-issued invoices (not product-specific invoices)
- Invoice header shows "Homelab OS" as the store name
- VAT/GST line items handled by LS automatically

No additional tax setup required when adding new products to the store. New products immediately inherit the store's global tax coverage.

---

---

## 16. Environment Variables

These variables are shared across all product apps via a central secret store (e.g. Doppler, or `.env.shared` in the monorepo).

```env
# ─── STORE (shared by all products) ──────────────────────
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_STORE_ID=
BILLING_WEBHOOK_URL=https://billing.homelabos.app/webhooks/lemonsqueezy

# ─── BILLING BEHAVIOUR ────────────────────────────────────
TRIAL_DAYS=14
DUNNING_GRACE_DAYS=14
LICENCE_VALIDATION_INTERVAL_HOURS=24
LICENCE_GRACE_PERIOD_DAYS=7

# ─── PRODUCT VARIANT IDS (see Section 3 for full list) ────
# ... all 60 variant ID vars ...

# ─── EMAIL (shared — Resend) ──────────────────────────────
RESEND_API_KEY=
BILLING_FROM_EMAIL=billing@homelabos.app
BILLING_REPLY_TO=support@homelabos.app
```

Each product app additionally sets its own:
```env
# Product identity — tells shared billing package which product this is
HOMELABOS_PRODUCT=proxyos   # or mxwatch, backupos, etc.
BILLING_SUCCESS_URL=https://app.proxyos.app/billing/success
BILLING_CANCEL_URL=https://app.proxyos.app/billing
```

---

---

## 17. Monorepo Integration

The billing package lives in the shared monorepo alongside all product apps:

```
homelabos/                          ← monorepo root
├── apps/
│   ├── hub/                        ← homelabos.app (Next.js — pricing, bundle, admin)
│   ├── mxwatch/                    ← mxwatch.app
│   ├── proxyos/                    ← proxyos.app
│   ├── backupos/                   ← backupos.app
│   ├── infraos/                    ← infraos.app
│   ├── lockboxos/                  ← lockboxos.app
│   ├── patchos/                    ← patchos.app
│   └── accessos/                   ← accessos.app
├── services/
│   └── billing-hub/                ← webhook fan-out service
├── packages/
│   ├── billing/                    ← shared billing package (this spec)
│   ├── ui/                         ← shared OS family UI components
│   ├── db/                         ← shared DB utils
│   └── types/                      ← shared types
└── .env.shared.example
```

Each product app imports from `@homelabos/billing`. The billing hub service imports the same package for the webhook router.

---

---

## 18. Build Order

```
Phase 1 — Store setup (one-time, manual)
  1.1  Create Lemon Squeezy store: "Homelab OS"
  1.2  Configure store: logo, brand colour, support email
  1.3  Create all products and variants (60 total)
       — can be scripted via LS API once store is created
  1.4  Record all variant IDs into environment variables
  1.5  Configure webhook: billing.homelabos.app/webhooks/lemonsqueezy
       Subscribe to all 12 event types

Phase 2 — packages/billing (shared package)
  2.1  types.ts — all shared billing types
  2.2  client.ts — LS API client
  2.3  variants.ts — getVariantId, deriveProductFromVariantId
  2.4  webhook.ts — signature verification, processWebhook
  2.5  checkout.ts — createCheckout (shared by all products)
  2.6  entitlements.ts — getEntitlements, checkFeature, computeEntitlements
  2.7  handlers/subscription.ts — activate, update, cancel, expire
  2.8  handlers/licence.ts — activate, validate, deactivate
  2.9  handlers/dunning.ts — dunning state machine
  2.10 portal.ts — getCustomerPortalUrl
  2.11 mrr.ts — MRR calculation

Phase 3 — billing-hub service
  3.1  Webhook endpoint (POST /webhooks/lemonsqueezy)
  3.2  Signature verification middleware
  3.3  Idempotency check (webhook_events table)
  3.4  Fan-out router (product detection → handler routing)
  3.5  Bundle handler (activates all 7 products simultaneously)
  3.6  Database schema + migrations (Postgres)

Phase 4 — MxWatch billing (first product — validate the pattern)
  4.1  billing tRPC router in mxwatch app
  4.2  /billing page (subscription status)
  4.3  /billing/pricing page (plan cards)
  4.4  /billing/success page
  4.5  Settings → Licence page (self-hosted)
  4.6  Trial flow
  4.7  Dunning emails via Resend

Phase 5 — ProxyOS billing (second product — copy MxWatch pattern)
  5.1  billing tRPC router in proxyos app
  5.2  All billing UI pages (same structure as MxWatch)

Phase 6 — Remaining products (BackupOS, InfraOS, LockBoxOS, PatchOS, AccessOS)
  6.1  Each follows the same pattern as MxWatch and ProxyOS
  6.2  Copy billing tRPC router, update product identifier
  6.3  Copy billing UI pages, update branding

Phase 7 — Bundle
  7.1  homelabos.app/pricing bundle section
  7.2  Bundle checkout flow
  7.3  Bundle activation handler (all 7 products)
  7.4  homelabos.app/billing consolidated subscriptions page

Phase 8 — Admin revenue dashboard
  8.1  homelabos.app/admin/revenue
  8.2  Per-product MRR, total MRR, churn, trials, conversions
  8.3  MRR-over-time chart (stacked by product)

Phase 9 — Polish
  9.1  Script to create all 60 LS variants programmatically
  9.2  Annual pricing toggle on all pricing pages
  9.3  Cross-sell links ("Save more with Bundle") on individual product pages
  9.4  homelabos.app/billing cross-product subscription overview
```

---

*Homelab OS Unified Store & Billing Spec v1.0 — homelabos.app — April 2026*
