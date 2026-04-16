import type { Entitlements, Plan, Product } from './types'

/**
 * Derives feature flags from a plan level.
 * Pure function — no DB access.
 */
export function deriveEntitlementFeatures(
  product: Product,
  plan: Plan,
  source: Entitlements['source'],
  validUntil: number | null,
): Entitlements {
  switch (plan) {
    case 'bundle':
      return {
        product,
        plan: 'bundle',
        source,
        validUntil,
        connectionsEnabled: true,
        apiEnabled: true,
        teamsEnabled: true,
        agentsLimit: -1,
        analyticsRetentionDays: 90,
        routeTemplatesLimit: -1,
      }
    case 'teams':
      return {
        product,
        plan: 'teams',
        source,
        validUntil,
        connectionsEnabled: true,
        apiEnabled: true,
        teamsEnabled: true,
        agentsLimit: -1,
        analyticsRetentionDays: 90,
        routeTemplatesLimit: -1,
      }
    case 'solo':
      return {
        product,
        plan: 'solo',
        source,
        validUntil,
        connectionsEnabled: true,
        apiEnabled: true,
        teamsEnabled: false,
        agentsLimit: 5,
        analyticsRetentionDays: 30,
        routeTemplatesLimit: 20,
      }
    default:
      return {
        product,
        plan: 'free',
        source: 'free',
        validUntil: null,
        connectionsEnabled: false,
        apiEnabled: false,
        teamsEnabled: false,
        agentsLimit: 1,
        analyticsRetentionDays: 7,
        routeTemplatesLimit: 5,
      }
  }
}

/**
 * Returns true if a feature is enabled for a given entitlement.
 */
export function checkFeature(
  entitlements: Entitlements,
  feature: keyof Pick<Entitlements, 'connectionsEnabled' | 'apiEnabled' | 'teamsEnabled'>,
): boolean {
  return entitlements[feature] === true
}
