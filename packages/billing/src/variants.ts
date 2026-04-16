import type { Product, BillingInterval, LicenceType } from './types'

type PlanKey = 'solo' | 'teams'

/**
 * Derives the env-var name for a given product/plan/interval/licenceType combination
 * and returns the variant ID value from process.env.
 *
 * Naming convention:
 *   Cloud:        {PRODUCT}_{PLAN}_MONTHLY_VARIANT_ID  (SOLO | TEAMS)
 *   Self-hosted:  {PRODUCT}_SH_PRO_MONTHLY_VARIANT_ID  (sh_pro)
 *                 {PRODUCT}_SH_TEAMS_MONTHLY_VARIANT_ID (sh_teams)
 *
 * e.g. PROXYOS_SOLO_MONTHLY_VARIANT_ID, PROXYOS_SH_PRO_ANNUAL_VARIANT_ID
 */
export function getVariantId(
  product: Product,
  plan: PlanKey,
  interval: BillingInterval,
  licenceType: LicenceType = 'cloud',
): string | null {
  const p = product.toUpperCase()
  const i = interval.toUpperCase()    // MONTHLY | ANNUAL

  let planSegment: string
  if (licenceType === 'sh_pro') {
    planSegment = 'SH_PRO'
  } else if (licenceType === 'sh_teams') {
    planSegment = 'SH_TEAMS'
  } else {
    planSegment = plan.toUpperCase()  // SOLO | TEAMS
  }

  const envKey = `${p}_${planSegment}_${i}_VARIANT_ID`
  return process.env[envKey] ?? null
}

/**
 * Given a LS variant ID, derive which product it belongs to by scanning env vars.
 * Returns null if not found.
 */
export function deriveProductFromVariantId(variantId: string): Product | null {
  const products: Product[] = [
    'mxwatch', 'proxyos', 'backupos', 'infraos',
    'lockboxos', 'patchos', 'accessos', 'bundle',
  ]
  const segments = ['SOLO', 'TEAMS', 'SH_PRO', 'SH_TEAMS']
  const intervals = ['MONTHLY', 'ANNUAL']

  for (const product of products) {
    const p = product.toUpperCase()
    for (const seg of segments) {
      for (const interval of intervals) {
        const envKey = `${p}_${seg}_${interval}_VARIANT_ID`
        if (process.env[envKey] === variantId) return product
      }
    }
  }
  return null
}
