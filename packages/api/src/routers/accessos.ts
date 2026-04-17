import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { routes, ssoProviders } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const accessosRouter = router({
  getConfig: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const r = row as Record<string, unknown>
      return {
        groups: r.accessosGroups ? JSON.parse(r.accessosGroups as string) as string[] : null,
        providerId: (r.accessosProviderId as string) ?? null,
      }
    }),

  setConfig: operatorProcedure
    .input(z.object({
      routeId: z.string(),
      groups: z.array(z.string()).nullable(),
      providerId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select({ id: routes.id }).from(routes)
        .where(eq(routes.id, input.routeId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      if (input.providerId) {
        const provider = await ctx.db.select({ id: ssoProviders.id }).from(ssoProviders)
          .where(eq(ssoProviders.id, input.providerId)).get()
        if (!provider) throw new TRPCError({ code: 'NOT_FOUND', message: 'SSO provider not found' })
      }

      await ctx.db.update(routes).set({
        accessosGroups: input.groups ? JSON.stringify(input.groups) : null,
        accessosProviderId: input.providerId,
        updatedAt: new Date(),
      } as Record<string, unknown>).where(eq(routes.id, input.routeId))

      return { ok: true }
    }),

  // List SSO providers that can act as an AccessOS OIDC provider
  listProviders: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(ssoProviders).all()
    return rows.map(p => ({ id: p.id, name: p.name, type: p.type, enabled: p.enabled }))
  }),
})
