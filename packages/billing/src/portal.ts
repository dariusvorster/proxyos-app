import { lsGet } from './client'

interface LSCustomerResponse {
  data: {
    attributes: {
      urls: {
        customer_portal: string
      }
    }
  }
}

/**
 * Returns the Lemon Squeezy customer portal URL for a given customer ID.
 * The portal URL lets users manage all their Homelab OS subscriptions in one place.
 */
export async function getCustomerPortalUrl(lsCustomerId: string): Promise<string> {
  const response = (await lsGet(`/v1/customers/${lsCustomerId}`)) as LSCustomerResponse
  return response.data.attributes.urls.customer_portal
}
