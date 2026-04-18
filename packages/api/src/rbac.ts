import { getDb, orgMemberships, siteMemberships, users, sites } from '@proxyos/db'
import { eq, and } from 'drizzle-orm'

export type EffectiveRole =
  | 'super_admin'
  | 'org_admin'
  | 'org_operator'
  | 'org_viewer'
  | 'site_operator'
  | 'site_viewer'
  | 'none'

export async function resolveEffectiveRole(
  userId: string,
  opts: { orgId?: string; siteId?: string },
): Promise<EffectiveRole> {
  const db = getDb()

  const user = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get()
  if (!user) return 'none'
  if (user.role === 'admin') return 'super_admin'

  let orgId = opts.orgId

  if (opts.siteId) {
    const siteMem = await db
      .select({ role: siteMemberships.role })
      .from(siteMemberships)
      .where(and(eq(siteMemberships.siteId, opts.siteId), eq(siteMemberships.userId, userId)))
      .get()
    if (siteMem) return siteMem.role as EffectiveRole

    if (!orgId) {
      const site = await db.select({ organizationId: sites.organizationId }).from(sites).where(eq(sites.id, opts.siteId)).get()
      if (site) orgId = site.organizationId
    }
  }

  if (orgId) {
    const orgMem = await db
      .select({ role: orgMemberships.role })
      .from(orgMemberships)
      .where(and(eq(orgMemberships.organizationId, orgId), eq(orgMemberships.userId, userId)))
      .get()
    if (orgMem) return orgMem.role as EffectiveRole
  }

  // Backward compat: flat role on user row
  if (user.role === 'operator') return 'org_operator'
  if (user.role === 'viewer') return 'org_viewer'

  return 'none'
}

export function canMutate(role: EffectiveRole): boolean {
  return (
    role === 'super_admin' ||
    role === 'org_admin' ||
    role === 'org_operator' ||
    role === 'site_operator'
  )
}

export function canRead(role: EffectiveRole): boolean {
  return role !== 'none'
}
