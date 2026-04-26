import { TRPCError } from '@trpc/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { scheduledChanges, routes, routeVersions, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'
import { rowToRoute, syncRouteToCaddy } from './routes'
import type { Route } from '@proxyos/types'

export const scheduledChangesRouter = router({
  listByRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(scheduledChanges)
        .where(eq(scheduledChanges.routeId, input.routeId))
        .orderBy(scheduledChanges.scheduledAt)
    }),

  listPending: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(scheduledChanges)
      .where(eq(scheduledChanges.status, 'pending'))
      .orderBy(scheduledChanges.scheduledAt)
  }),

  create: operatorProcedure
    .input(z.object({
      routeId: z.string(),
      action: z.enum(['enable', 'disable', 'update_upstream', 'rollback']),
      payload: z.record(z.unknown()).nullable().default(null),
      scheduledAt: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      const route = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!route) throw new TRPCError({ code: 'NOT_FOUND' })
      const now = new Date()
      const id = nanoid()
      await ctx.db.insert(scheduledChanges).values({
        id,
        routeId: input.routeId,
        action: input.action,
        payload: input.payload ? JSON.stringify(input.payload) : null,
        scheduledAt: new Date(input.scheduledAt),
        status: 'pending',
        createdAt: now,
      })
      return ctx.db.select().from(scheduledChanges).where(eq(scheduledChanges.id, id)).get()
    }),

  cancel: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(scheduledChanges).where(eq(scheduledChanges.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      if (row.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only pending changes can be cancelled' })
      await ctx.db.update(scheduledChanges).set({ status: 'cancelled' }).where(eq(scheduledChanges.id, input.id))
      return { success: true }
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(scheduledChanges).where(eq(scheduledChanges.id, input.id))
      return { success: true }
    }),

  executeDue: operatorProcedure.mutation(async ({ ctx }) => {
    const now = new Date()
    const due = await ctx.db
      .select()
      .from(scheduledChanges)
      .where(and(eq(scheduledChanges.status, 'pending'), lte(scheduledChanges.scheduledAt, now)))

    let executed = 0
    let failed = 0

    for (const change of due) {
      try {
        const routeRow = await ctx.db.select().from(routes).where(eq(routes.id, change.routeId)).get()
        if (!routeRow) throw new Error('Route not found')

        const payload = change.payload ? JSON.parse(change.payload) as Record<string, unknown> : {}

        if (change.action === 'enable') {
          await ctx.db.update(routes).set({ enabled: true }).where(eq(routes.id, change.routeId))
          await syncRouteToCaddy(ctx, rowToRoute({ ...routeRow, enabled: true }), 'scheduled')
        } else if (change.action === 'disable') {
          await ctx.db.update(routes).set({ enabled: false }).where(eq(routes.id, change.routeId))
          await syncRouteToCaddy(ctx, rowToRoute({ ...routeRow, enabled: false }), 'scheduled')
        } else if (change.action === 'update_upstream') {
          const upstreams = JSON.stringify(payload.upstreams ?? [])
          await ctx.db.update(routes).set({ upstreams }).where(eq(routes.id, change.routeId))
          const updated = await ctx.db.select().from(routes).where(eq(routes.id, change.routeId)).get()
          await syncRouteToCaddy(ctx, rowToRoute(updated!), 'scheduled')
        } else if (change.action === 'rollback') {
          const versionId = String(payload.versionId ?? '')
          const version = await ctx.db.select().from(routeVersions).where(eq(routeVersions.id, versionId)).get()
          if (!version) throw new Error(`Version ${versionId} not found`)
          const snapshot = JSON.parse(version.configSnapshotJson) as Route
          await ctx.db.update(routes).set({
            upstreams: JSON.stringify(snapshot.upstreams),
            lbPolicy: snapshot.lbPolicy ?? 'round_robin',
            tlsMode: snapshot.tlsMode,
            enabled: snapshot.enabled,
          }).where(eq(routes.id, change.routeId))
          const updated = await ctx.db.select().from(routes).where(eq(routes.id, change.routeId)).get()
          await syncRouteToCaddy(ctx, rowToRoute(updated!), 'scheduled-rollback')
        }

        await ctx.db.update(scheduledChanges)
          .set({ status: 'done', executedAt: now })
          .where(eq(scheduledChanges.id, change.id))
        executed++
      } catch (err) {
        await ctx.db.update(scheduledChanges)
          .set({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
          .where(eq(scheduledChanges.id, change.id))
        failed++
      }
    }

    return { executed, failed, total: due.length }
  }),
})
