import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { buildRedirectRoute } from '@proxyos/caddy'
import { redirectHosts, nanoid, auditLog, systemLog } from '@proxyos/db'
import { buildLogEntry } from './systemLog'
import { publicProcedure, router } from '../trpc'

const createInput = z.object({
  sourceDomain: z.string().min(1).max(253),
  destinationUrl: z.string().min(1),
  redirectCode: z.union([z.literal(301), z.literal(302)]).default(301),
  preservePath: z.boolean().default(true),
  preserveQuery: z.boolean().default(true),
  tlsEnabled: z.boolean().default(true),
  accessListId: z.string().nullable().default(null),
})

type CreateInput = z.infer<typeof createInput>

function rowToRedirectHost(row: typeof redirectHosts.$inferSelect) {
  return {
    id: row.id,
    sourceDomain: row.sourceDomain,
    destinationUrl: row.destinationUrl,
    redirectCode: row.redirectCode as 301 | 302,
    preservePath: row.preservePath,
    preserveQuery: row.preserveQuery,
    tlsEnabled: row.tlsEnabled,
    accessListId: row.accessListId,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function syncRedirectToCaddy(
  ctx: { caddy: import('@proxyos/caddy').CaddyClient },
  host: ReturnType<typeof rowToRedirectHost>,
): Promise<void> {
  await ctx.caddy.updateRoute(
    `redirect_${host.sourceDomain}`,
    buildRedirectRoute(host),
  )
}

export const redirectHostsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(redirectHosts)
    return rows.map(rowToRedirectHost)
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(redirectHosts).where(eq(redirectHosts.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return rowToRedirectHost(row)
    }),

  create: publicProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.select().from(redirectHosts).where(eq(redirectHosts.sourceDomain, input.sourceDomain)).get()
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: `${input.sourceDomain} already has a redirect host` })
    }

    const now = new Date()
    const id = nanoid()

    await ctx.db.insert(redirectHosts).values({
      id,
      sourceDomain: input.sourceDomain,
      destinationUrl: input.destinationUrl,
      redirectCode: input.redirectCode,
      preservePath: input.preservePath,
      preserveQuery: input.preserveQuery,
      tlsEnabled: input.tlsEnabled,
      accessListId: input.accessListId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })

    const host = rowToRedirectHost({
      id,
      agentId: null,
      sourceDomain: input.sourceDomain,
      destinationUrl: input.destinationUrl,
      redirectCode: input.redirectCode,
      preservePath: input.preservePath,
      preserveQuery: input.preserveQuery,
      tlsEnabled: input.tlsEnabled,
      accessListId: input.accessListId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })

    try {
      await ctx.caddy.addRoute(buildRedirectRoute(host))
    } catch (err) {
      await ctx.db.delete(redirectHosts).where(eq(redirectHosts.id, id))
      await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to push redirect host "${input.sourceDomain}" to Caddy`, {
        sourceDomain: input.sourceDomain,
        destinationUrl: input.destinationUrl,
        error: (err as Error).message,
        stack: (err as Error).stack,
      })).catch(() => {})
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to push redirect host to Caddy: ${(err as Error).message}`,
      })
    }

    await ctx.db.insert(auditLog).values({
      id: nanoid(),
      action: 'redirectHost.create',
      resourceType: 'redirectHost',
      resourceId: id,
      resourceName: host.sourceDomain,
      actor: 'user',
      detail: JSON.stringify({ destinationUrl: input.destinationUrl, redirectCode: input.redirectCode }),
      createdAt: now,
    })

    return host
  }),

  update: publicProcedure
    .input(z.object({
      id: z.string(),
      patch: createInput.partial(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(redirectHosts).where(eq(redirectHosts.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const update: Record<string, unknown> = { updatedAt: new Date() }
      const p = input.patch
      if (p.sourceDomain !== undefined) update.sourceDomain = p.sourceDomain
      if (p.destinationUrl !== undefined) update.destinationUrl = p.destinationUrl
      if (p.redirectCode !== undefined) update.redirectCode = p.redirectCode
      if (p.preservePath !== undefined) update.preservePath = p.preservePath
      if (p.preserveQuery !== undefined) update.preserveQuery = p.preserveQuery
      if (p.tlsEnabled !== undefined) update.tlsEnabled = p.tlsEnabled
      if (p.accessListId !== undefined) update.accessListId = p.accessListId

      await ctx.db.update(redirectHosts).set(update).where(eq(redirectHosts.id, input.id))

      const updated = await ctx.db.select().from(redirectHosts).where(eq(redirectHosts.id, input.id)).get()
      const host = rowToRedirectHost(updated!)

      try {
        await syncRedirectToCaddy(ctx, host)
      } catch (err) {
        await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to update redirect host "${host.sourceDomain}" in Caddy`, {
          sourceDomain: host.sourceDomain,
          patch: input.patch,
          error: (err as Error).message,
          stack: (err as Error).stack,
        })).catch(() => {})
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to update Caddy: ${(err as Error).message}` })
      }

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'redirectHost.update',
        resourceType: 'redirectHost',
        resourceId: input.id,
        resourceName: host.sourceDomain,
        actor: 'user',
        detail: JSON.stringify(p),
        createdAt: new Date(),
      })

      return host
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(redirectHosts).where(eq(redirectHosts.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.caddy.removeRoute(`redirect_${row.sourceDomain}`)
      await ctx.db.delete(redirectHosts).where(eq(redirectHosts.id, input.id))

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'redirectHost.delete',
        resourceType: 'redirectHost',
        resourceId: input.id,
        resourceName: row.sourceDomain,
        actor: 'user',
        createdAt: new Date(),
      })

      return { success: true }
    }),

  toggle: publicProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(redirectHosts).where(eq(redirectHosts.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.db.update(redirectHosts).set({ enabled: input.enabled, updatedAt: new Date() }).where(eq(redirectHosts.id, input.id))

      if (input.enabled) {
        const updated = await ctx.db.select().from(redirectHosts).where(eq(redirectHosts.id, input.id)).get()
        const host = rowToRedirectHost(updated!)
        try {
          await syncRedirectToCaddy(ctx, host)
        } catch (err) {
          await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to re-enable redirect host "${host.sourceDomain}" in Caddy`, {
            sourceDomain: host.sourceDomain,
            error: (err as Error).message,
          })).catch(() => {})
        }
      } else {
        await ctx.caddy.removeRoute(`redirect_${row.sourceDomain}`)
      }

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: input.enabled ? 'redirectHost.enable' : 'redirectHost.disable',
        resourceType: 'redirectHost',
        resourceId: input.id,
        resourceName: row.sourceDomain,
        actor: 'user',
        createdAt: new Date(),
      })

      return { success: true }
    }),
})
