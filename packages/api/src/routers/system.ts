import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { systemSettings } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

export const systemRouter = router({
  caddyStatus: publicProcedure.query(async ({ ctx }) => {
    const reachable = await ctx.caddy.health()
    const hasMain = reachable ? await ctx.caddy.hasServer('main') : false
    return { reachable, hasMain }
  }),

  deploymentMode: publicProcedure.query(() => {
    const tier = (process.env.PROXYOS_TIER ?? 'homelab') as 'homelab' | 'cloud'
    return { tier }
  }),

  getForceHttps: publicProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.select().from(systemSettings).where(eq(systemSettings.key, 'force_https')).get()
    return { enabled: row?.value === 'true' }
  }),

  setForceHttps: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date()
      await ctx.db
        .insert(systemSettings)
        .values({ key: 'force_https', value: String(input.enabled), updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(input.enabled), updatedAt: now } })
      if (input.enabled) {
        await ctx.caddy.setHttpRedirectServer()
      } else {
        await ctx.caddy.removeHttpRedirectServer()
      }
      return { enabled: input.enabled }
    }),
})
