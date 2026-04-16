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
})
