import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { servicePresets } from '@proxyos/db'
import type { ServicePreset } from '@proxyos/types'
import { publicProcedure, router } from '../trpc'

function rowToPreset(row: typeof servicePresets.$inferSelect): ServicePreset {
  return {
    id: row.id,
    name: row.name,
    category: row.category as ServicePreset['category'],
    icon: row.icon ?? null,
    defaultPort: row.defaultPort,
    upstreamProtocol: row.upstreamProtocol as ServicePreset['upstreamProtocol'],
    websocket: row.websocket,
    suggestedSubdomain: row.suggestedSubdomain ?? null,
    healthCheckPath: row.healthCheckPath ?? null,
    healthCheckExpectStatus: row.healthCheckExpectStatus ?? null,
    defaultHeaders: row.defaultHeaders ?? null,
    notes: row.notes ?? null,
    builtIn: row.builtIn,
    createdAt: row.createdAt,
  }
}

export const presetsRouter = router({
  list: publicProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db.select().from(servicePresets)
      const filtered = input?.category
        ? rows.filter(r => r.category === input.category)
        : rows
      return filtered
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map(rowToPreset)
    }),

  // publicProcedure is intentional — presets are read-only reference data, not sensitive.
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const row = await ctx.db.select().from(servicePresets).where(eq(servicePresets.id, input.id)).get()
      return row ? rowToPreset(row) : null
    }),
})
