import { lsLicencePost } from '../client'
import type {
  LicenceActivationResult,
  LSLicenceActivateResponse,
  LSLicenceValidateResponse,
  Plan,
  BillingInterval,
} from '../types'

function inferPlanFromVariantName(variantName: string): Plan {
  const v = variantName.toLowerCase()
  if (v.includes('teams') || v.includes('sh_teams')) return 'teams'
  if (v.includes('solo') || v.includes('pro')) return 'solo'
  return 'solo'
}

function inferIntervalFromVariantName(variantName: string): BillingInterval {
  const v = variantName.toLowerCase()
  if (v.includes('annual') || v.includes('yearly')) return 'annual'
  return 'monthly'
}

/**
 * Activates a Lemon Squeezy licence key against a named instance.
 */
export async function activateLicenceKey(
  licenceKey: string,
  instanceName: string,
): Promise<LicenceActivationResult> {
  const response = (await lsLicencePost('/v1/licenses/activate', {
    license_key: licenceKey,
    instance_name: instanceName,
  })) as LSLicenceActivateResponse

  if (!response.activated) {
    throw new Error(response.error ?? 'Licence activation failed')
  }

  const meta = response.licence_key.meta
  return {
    instanceId: response.instance.id,
    purchaserEmail: meta.customer_email,
    orderId: meta.order_id,
    variantId: meta.variant_id,
    plan: inferPlanFromVariantName(meta.variant_name),
    billingInterval: inferIntervalFromVariantName(meta.variant_name),
  }
}

/**
 * Validates a Lemon Squeezy licence key. Returns true if valid and active.
 */
export async function validateLicenceKey(
  licenceKey: string,
  instanceId: string,
): Promise<boolean> {
  const response = (await lsLicencePost('/v1/licenses/validate', {
    license_key: licenceKey,
    instance_id: instanceId,
  })) as LSLicenceValidateResponse

  return response.valid && response.licence_key.status === 'active'
}

/**
 * Deactivates a Lemon Squeezy licence key instance.
 */
export async function deactivateLicenceKey(
  licenceKey: string,
  instanceId: string,
): Promise<void> {
  await lsLicencePost('/v1/licenses/deactivate', {
    license_key: licenceKey,
    instance_id: instanceId,
  })
}
