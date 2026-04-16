import type { CheckoutParams } from './types'
import { lsPost } from './client'

interface LSCheckoutResponse {
  data: {
    attributes: {
      url: string
    }
  }
}

/**
 * Creates a Lemon Squeezy hosted checkout session and returns the redirect URL.
 */
export async function createCheckout(params: CheckoutParams): Promise<string> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID
  if (!storeId) throw new Error('LEMONSQUEEZY_STORE_ID is not set')

  const checkoutOptions: Record<string, unknown> = {
    embed: false,
    media: false,
    logo: true,
  }

  if (params.trialDays) {
    checkoutOptions.subscription_trial_end = Math.floor(
      (Date.now() + params.trialDays * 86_400_000) / 1000,
    ).toString()
  }

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: params.email,
          custom: {
            user_id: params.userId,
            product: params.product,
            plan: params.plan,
            licence_type: params.licenceType ?? 'cloud',
          },
        },
        checkout_options: checkoutOptions,
        product_options: {
          redirect_url: params.successUrl,
        },
      },
      relationships: {
        store: {
          data: { type: 'stores', id: storeId },
        },
        variant: {
          data: { type: 'variants', id: params.variantId },
        },
      },
    },
  }

  const response = (await lsPost('/v1/checkouts', body)) as LSCheckoutResponse
  return response.data.attributes.url
}
