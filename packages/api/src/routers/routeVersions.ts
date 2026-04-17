import { TRPCError } from '@trpc/server'
import { desc, eq, max } from 'drizzle-orm'
import { z } from 'zod'
import { auditLog, nanoid, routeVersions, routes, type Db } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'
import type { Route } from '@proxyos/types'

export async function insertRouteVersion(
  db: Db,
  route: Route,
  changedBy = 'user',
  changeReason?: string,
  rollbackOf?: string,
): Promise<void> {
  const latest = await db
    .select({ max: max(routeVersions.versionNumber) })
    .from(routeVersions)
    .where(eq(routeVersions.routeId, route.id))
    .get()
  const nextVersion = (latest?.max ?? 0) + 1

  await db.insert(routeVersions).values({
    id: nanoid(),
    routeId: route.id,
    versionNumber: nextVersion,
    configSnapshotJson: JSON.stringify(route),
    changedBy,
    changedAt: new Date(),
    changeReason: changeReason ?? null,
    rollbackOf: rollbackOf ?? null,
  })

  // Prune: keep only last 50 versions per route
  const versions = await db
    .select({ id: routeVersions.id })
    .from(routeVersions)
    .where(eq(routeVersions.routeId, route.id))
    .orderBy(desc(routeVersions.versionNumber))
  if (versions.length > 50) {
    const toDelete = versions.slice(50)
    for (const v of toDelete) {
      await db.delete(routeVersions).where(eq(routeVersions.id, v.id))
    }
  }
}

export const routeVersionsRouter = router({
  listByRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(routeVersions)
        .where(eq(routeVersions.routeId, input.routeId))
        .orderBy(desc(routeVersions.versionNumber))
        .limit(50)
      return rows
    }),

  rollback: operatorProcedure
    .input(z.object({ versionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const version = await ctx.db
        .select()
        .from(routeVersions)
        .where(eq(routeVersions.id, input.versionId))
        .get()
      if (!version) throw new TRPCError({ code: 'NOT_FOUND' })

      const snapshot = JSON.parse(version.configSnapshotJson) as Route
      const now = new Date()

      await ctx.db.update(routes).set({
        name: snapshot.name,
        upstreams: JSON.stringify(snapshot.upstreams),
        lbPolicy: snapshot.lbPolicy ?? 'round_robin',
        tlsMode: snapshot.tlsMode,
        tlsDnsProviderId: snapshot.tlsDnsProviderId ?? null,
        ssoEnabled: snapshot.ssoEnabled,
        ssoProviderId: snapshot.ssoProviderId ?? null,
        rateLimit: snapshot.rateLimit ? JSON.stringify(snapshot.rateLimit) : null,
        ipAllowlist: snapshot.ipAllowlist ? JSON.stringify(snapshot.ipAllowlist) : null,
        basicAuth: snapshot.basicAuth ? JSON.stringify(snapshot.basicAuth) : null,
        compressionEnabled: snapshot.compressionEnabled,
        websocketEnabled: snapshot.websocketEnabled,
        http2Enabled: snapshot.http2Enabled,
        http3Enabled: snapshot.http3Enabled,
        healthCheckEnabled: snapshot.healthCheckEnabled,
        healthCheckPath: snapshot.healthCheckPath,
        healthCheckInterval: snapshot.healthCheckInterval,
        updatedAt: now,
      }).where(eq(routes.id, snapshot.id))

      // Create a new version recording the rollback
      await insertRouteVersion(ctx.db, { ...snapshot, updatedAt: now }, 'user', `Rollback to v${version.versionNumber}`, version.id)

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'route.rollback',
        resourceType: 'route',
        resourceId: snapshot.id,
        resourceName: snapshot.domain,
        actor: 'user',
        detail: JSON.stringify({ toVersionId: input.versionId, toVersionNumber: version.versionNumber }),
        createdAt: now,
      })

      return { success: true, routeId: snapshot.id }
    }),
})
