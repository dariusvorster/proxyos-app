import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { healthChecks } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

export const healthChecksRouter = router({
  listByRoute: publicProcedure
    .input(z.object({ routeId: z.string(), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(healthChecks)
        .where(eq(healthChecks.routeId, input.routeId))
        .orderBy(desc(healthChecks.checkedAt))
        .limit(input.limit)
      return rows
    }),
})
