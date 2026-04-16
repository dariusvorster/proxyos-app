import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { buildErrorRoute } from '@proxyos/caddy'
import { errorHosts, nanoid, auditLog, systemLog } from '@proxyos/db'
import { buildLogEntry } from './systemLog'
import { publicProcedure, router } from '../trpc'

const createInput = z.object({
  domain: z.string().min(1).max(253),
  statusCode: z.number().int().default(404),
  pageType: z.enum(['default', 'custom_html', 'redirect']).default('default'),
  customHtml: z.string().nullable().default(null),
  redirectUrl: z.string().nullable().default(null),
  tlsEnabled: z.boolean().default(true),
})

type ErrorHostRow = typeof errorHosts.$inferSelect

function rowToErrorHost(row: ErrorHostRow) {
  return {
    id: row.id,
    domain: row.domain,
    statusCode: row.statusCode,
    pageType: row.pageType as 'default' | 'custom_html' | 'redirect',
    customHtml: row.customHtml,
    redirectUrl: row.redirectUrl,
    tlsEnabled: row.tlsEnabled,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export const errorHostsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(errorHosts)
    return rows.map(rowToErrorHost)
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(errorHosts).where(eq(errorHosts.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      return rowToErrorHost(row)
    }),

  create: publicProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.select().from(errorHosts).where(eq(errorHosts.domain, input.domain)).get()
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: `${input.domain} already has an error host` })
    }

    const now = new Date()
    const id = nanoid()

    await ctx.db.insert(errorHosts).values({
      id,
      domain: input.domain,
      statusCode: input.statusCode,
      pageType: input.pageType,
      customHtml: input.customHtml,
      redirectUrl: input.redirectUrl,
      tlsEnabled: input.tlsEnabled,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })

    try {
      await ctx.caddy.addRoute(buildErrorRoute({
        domain: input.domain,
        statusCode: input.statusCode,
        pageType: input.pageType,
        customHtml: input.customHtml,
        redirectUrl: input.redirectUrl,
      }))
    } catch (err) {
      await ctx.db.delete(errorHosts).where(eq(errorHosts.id, id))
      await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to push error host "${input.domain}" to Caddy`, {
        domain: input.domain,
        statusCode: input.statusCode,
        pageType: input.pageType,
        error: (err as Error).message,
        stack: (err as Error).stack,
      })).catch(() => {})
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to push error host to Caddy: ${(err as Error).message}`,
      })
    }

    await ctx.db.insert(auditLog).values({
      id: nanoid(),
      action: 'errorHost.create',
      resourceType: 'errorHost',
      resourceId: id,
      resourceName: input.domain,
      actor: 'user',
      detail: JSON.stringify({ statusCode: input.statusCode, pageType: input.pageType }),
      createdAt: now,
    })

    const row = await ctx.db.select().from(errorHosts).where(eq(errorHosts.id, id)).get()
    return rowToErrorHost(row!)
  }),

  update: publicProcedure
    .input(z.object({
      id: z.string(),
      patch: createInput.partial(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(errorHosts).where(eq(errorHosts.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const now = new Date()
      const update: Record<string, unknown> = { updatedAt: now }
      const p = input.patch
      if (p.domain !== undefined) update.domain = p.domain
      if (p.statusCode !== undefined) update.statusCode = p.statusCode
      if (p.pageType !== undefined) update.pageType = p.pageType
      if (p.customHtml !== undefined) update.customHtml = p.customHtml
      if (p.redirectUrl !== undefined) update.redirectUrl = p.redirectUrl
      if (p.tlsEnabled !== undefined) update.tlsEnabled = p.tlsEnabled

      await ctx.db.update(errorHosts).set(update).where(eq(errorHosts.id, input.id))

      const updated = await ctx.db.select().from(errorHosts).where(eq(errorHosts.id, input.id)).get()
      const host = rowToErrorHost(updated!)

      try {
        await ctx.caddy.updateRoute(`error_${row.domain}`, buildErrorRoute({
          domain: host.domain,
          statusCode: host.statusCode,
          pageType: host.pageType,
          customHtml: host.customHtml,
          redirectUrl: host.redirectUrl,
        }))
      } catch (err) {
        await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to update error host "${host.domain}" in Caddy`, {
          domain: host.domain,
          patch: input.patch,
          error: (err as Error).message,
          stack: (err as Error).stack,
        })).catch(() => {})
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to update Caddy: ${(err as Error).message}` })
      }

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'errorHost.update',
        resourceType: 'errorHost',
        resourceId: input.id,
        resourceName: host.domain,
        actor: 'user',
        detail: JSON.stringify(p),
        createdAt: now,
      })

      return host
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(errorHosts).where(eq(errorHosts.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.caddy.removeRoute(`error_${row.domain}`)
      await ctx.db.delete(errorHosts).where(eq(errorHosts.id, input.id))

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: 'errorHost.delete',
        resourceType: 'errorHost',
        resourceId: input.id,
        resourceName: row.domain,
        actor: 'user',
        createdAt: new Date(),
      })

      return { success: true }
    }),

  toggle: publicProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(errorHosts).where(eq(errorHosts.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.db.update(errorHosts).set({ enabled: input.enabled, updatedAt: new Date() }).where(eq(errorHosts.id, input.id))

      if (input.enabled) {
        try {
          await ctx.caddy.addRoute(buildErrorRoute({
            domain: row.domain,
            statusCode: row.statusCode,
            pageType: row.pageType as 'default' | 'custom_html' | 'redirect',
            customHtml: row.customHtml,
            redirectUrl: row.redirectUrl,
          }))
        } catch (err) {
          await ctx.db.insert(systemLog).values(buildLogEntry('error', 'caddy', `Failed to enable error host "${row.domain}" in Caddy`, {
            domain: row.domain,
            error: (err as Error).message,
          })).catch(() => {})
        }
      } else {
        await ctx.caddy.removeRoute(`error_${row.domain}`)
      }

      await ctx.db.insert(auditLog).values({
        id: nanoid(),
        action: input.enabled ? 'errorHost.enable' : 'errorHost.disable',
        resourceType: 'errorHost',
        resourceId: input.id,
        resourceName: row.domain,
        actor: 'user',
        createdAt: new Date(),
      })

      return { success: true }
    }),
})
