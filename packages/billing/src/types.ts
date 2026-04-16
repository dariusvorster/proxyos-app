export type Product =
  | 'mxwatch'
  | 'proxyos'
  | 'backupos'
  | 'infraos'
  | 'lockboxos'
  | 'patchos'
  | 'accessos'
  | 'bundle'

export type Plan = 'free' | 'solo' | 'teams' | 'bundle'
export type BillingInterval = 'monthly' | 'annual'
export type LicenceType = 'cloud' | 'sh_pro' | 'sh_teams'

export type SubscriptionStatus =
  | 'on_trial'
  | 'active'
  | 'paused'
  | 'past_due'
  | 'unpaid'
  | 'cancelled'
  | 'expired'

export interface CheckoutCustomData {
  user_id: string
  product: Product
  plan: Plan
  licence_type: LicenceType
}

export interface LSSubscriptionAttributes {
  customer_id: number
  order_id: number
  user_email: string
  user_name: string
  variant_id: number
  product_id: number
  status: SubscriptionStatus
  current_period_start: string
  current_period_end: string
  trial_ends_at: string | null
  cancelled_at: string | null
  ends_at: string | null
  urls: {
    update_payment_method: string
    customer_portal: string
  }
}

export interface LemonSqueezyEvent {
  meta: {
    event_name: string
    custom_data?: Partial<CheckoutCustomData>
  }
  data: {
    id: string
    attributes: LSSubscriptionAttributes & Record<string, unknown>
  }
}

export interface CheckoutParams {
  variantId: string
  userId: string
  email: string
  product: Product
  plan: Plan
  licenceType?: LicenceType
  successUrl: string
  cancelUrl: string
  trialDays?: number
}

export interface Entitlements {
  product: Product
  plan: Plan
  source: 'subscription' | 'licence' | 'bundle' | 'free'
  validUntil: number | null
  connectionsEnabled: boolean
  apiEnabled: boolean
  teamsEnabled: boolean
  agentsLimit: number          // -1 = unlimited
  analyticsRetentionDays: number
  routeTemplatesLimit: number  // -1 = unlimited
}

export interface LicenceActivationResult {
  instanceId: string
  purchaserEmail: string
  orderId: string
  variantId: string
  plan: Plan
  billingInterval: BillingInterval
}

export interface LSLicenceActivateResponse {
  activated: boolean
  error: string | null
  licence_key: {
    id: number
    status: string
    key: string
    activation_limit: number
    activation_usage: number
    expires_at: string | null
    meta: {
      order_id: string
      variant_id: string
      customer_email: string
      product_name: string
      variant_name: string
    }
  }
  instance: {
    id: string
    name: string
    created_at: string
  }
}

export interface LSLicenceValidateResponse {
  valid: boolean
  error: string | null
  licence_key: {
    status: string
    expires_at: string | null
  }
  instance: {
    id: string
    name: string
  } | null
}
