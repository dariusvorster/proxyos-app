import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { oauthProviders, nanoid } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const oauthProvidersRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(oauthProviders)
    return rows.map(r => ({
      id: r.id,
      type: r.type as 'github' | 'google' | 'microsoft' | 'oidc',
      name: r.name,
      clientId: r.clientId,
      oidcDiscoveryUrl: r.oidcDiscoveryUrl,
      allowedDomains: r.allowedDomains ? JSON.parse(r.allowedDomains) as string[] : null,
      allowedUsers: r.allowedUsers ? JSON.parse(r.allowedUsers) as string[] : null,
      enabled: r.enabled,
      createdAt: r.createdAt,
    }))
  }),

  create: operatorProcedure
    .input(z.object({
      type: z.enum(['github', 'google', 'microsoft', 'oidc']),
      name: z.string().min(1).max(100),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      oidcDiscoveryUrl: z.string().url().optional(),
      allowedDomains: z.array(z.string()).optional(),
      allowedUsers: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.type === 'oidc' && !input.oidcDiscoveryUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'oidcDiscoveryUrl required for OIDC providers' })
      }
      const id = nanoid()
      await ctx.db.insert(oauthProviders).values({
        id,
        type: input.type,
        name: input.name,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        oidcDiscoveryUrl: input.oidcDiscoveryUrl ?? null,
        allowedDomains: input.allowedDomains ? JSON.stringify(input.allowedDomains) : null,
        allowedUsers: input.allowedUsers ? JSON.stringify(input.allowedUsers) : null,
        enabled: true,
        createdAt: new Date(),
      })
      return { id, success: true }
    }),

  update: operatorProcedure
    .input(z.object({
      id: z.string(),
      patch: z.object({
        name: z.string().min(1).max(100).optional(),
        clientId: z.string().min(1).optional(),
        clientSecret: z.string().min(1).optional(),
        oidcDiscoveryUrl: z.string().url().nullable().optional(),
        allowedDomains: z.array(z.string()).nullable().optional(),
        allowedUsers: z.array(z.string()).nullable().optional(),
        enabled: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(oauthProviders).where(eq(oauthProviders.id, input.id)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const update: Record<string, unknown> = {}
      const p = input.patch
      if (p.name !== undefined) update.name = p.name
      if (p.clientId !== undefined) update.clientId = p.clientId
      if (p.clientSecret !== undefined) update.clientSecret = p.clientSecret
      if (p.oidcDiscoveryUrl !== undefined) update.oidcDiscoveryUrl = p.oidcDiscoveryUrl
      if (p.allowedDomains !== undefined) update.allowedDomains = p.allowedDomains ? JSON.stringify(p.allowedDomains) : null
      if (p.allowedUsers !== undefined) update.allowedUsers = p.allowedUsers ? JSON.stringify(p.allowedUsers) : null
      if (p.enabled !== undefined) update.enabled = p.enabled
      await ctx.db.update(oauthProviders).set(update).where(eq(oauthProviders.id, input.id))
      return { success: true }
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(oauthProviders).where(eq(oauthProviders.id, input.id))
      return { success: true }
    }),
})
