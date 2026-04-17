import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { routes, mxwatchCache } from '@proxyos/db'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const mxwatchRouter = router({
  getForRoute: publicProcedure
    .input(z.object({ routeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(routes).where(eq(routes.id, input.routeId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
      const r = row as Record<string, unknown>
      const domain = r.mxwatchDomain as string | null

      if (!domain) return { domain: null, deliverability: null }

      const cache = await ctx.db.select().from(mxwatchCache)
        .where(eq(mxwatchCache.domain, domain)).get()

      return {
        domain,
        deliverability: cache ? {
          score: cache.deliverabilityScore,
          rblListed: cache.rblListed,
          rblDetails: cache.rblDetails ? JSON.parse(cache.rblDetails) as string[] : [],
          dkimPass: cache.dkimPass,
          spfPass: cache.spfPass,
          dmarcPass: cache.dmarcPass,
          checkedAt: cache.checkedAt,
        } : null,
      }
    }),

  setDomain: operatorProcedure
    .input(z.object({
      routeId: z.string(),
      domain: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select({ id: routes.id }).from(routes)
        .where(eq(routes.id, input.routeId)).get()
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      await ctx.db.update(routes).set({
        mxwatchDomain: input.domain,
        updatedAt: new Date(),
      } as Record<string, unknown>).where(eq(routes.id, input.routeId))

      return { ok: true }
    }),

  // Called by MxWatch webhook to push updated deliverability data
  updateCache: publicProcedure
    .input(z.object({
      domain: z.string(),
      deliverabilityScore: z.number().int().min(0).max(100).nullable(),
      rblListed: z.boolean(),
      rblDetails: z.array(z.string()).optional(),
      dkimPass: z.boolean().nullable(),
      spfPass: z.boolean().nullable(),
      dmarcPass: z.boolean().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      const existing = await ctx.db.select({ domain: mxwatchCache.domain }).from(mxwatchCache)
        .where(eq(mxwatchCache.domain, input.domain)).get()

      const values = {
        domain: input.domain,
        deliverabilityScore: input.deliverabilityScore,
        rblListed: input.rblListed,
        rblDetails: input.rblDetails ? JSON.stringify(input.rblDetails) : null,
        dkimPass: input.dkimPass,
        spfPass: input.spfPass,
        dmarcPass: input.dmarcPass,
        checkedAt: now,
      }

      if (existing) {
        await ctx.db.update(mxwatchCache).set(values).where(eq(mxwatchCache.domain, input.domain))
      } else {
        await ctx.db.insert(mxwatchCache).values(values)
      }

      return { ok: true }
    }),

  listCached: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(mxwatchCache).all()
  }),
})
