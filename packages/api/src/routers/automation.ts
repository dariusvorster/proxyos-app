import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { composeWatchers, nanoid } from '@proxyos/db'
import { startWatcher, stopWatcher, activeWatcherIds } from '../automation/compose-watcher'
import { publicProcedure, operatorProcedure, router } from '../trpc'

export const automationRouter = router({
  listComposeWatchers: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(composeWatchers).all()
    const active = new Set(activeWatcherIds())
    return rows.map(r => ({ ...r, running: active.has(r.id) }))
  }),

  createComposeWatcher: operatorProcedure
    .input(z.object({
      projectPath: z.string().min(1),
      agentId: z.string().nullable().default(null),
      autoApply: z.boolean().default(true),
      watchInterval: z.number().min(5).max(3600).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(composeWatchers).values({
        id,
        projectPath: input.projectPath,
        agentId: input.agentId,
        autoApply: input.autoApply,
        watchInterval: input.watchInterval,
        enabled: true,
        createdAt: now,
      })
      startWatcher(id, {
        projectPath: input.projectPath,
        agentId: input.agentId,
        autoApply: input.autoApply,
        watchInterval: input.watchInterval,
      }, (diff, path) => {
        console.log(`[compose-watcher] ${path} changed:`, diff)
        // In a full implementation, diffs would trigger route CRUD via the routes router
      })
      return { id }
    }),

  toggleComposeWatcher: operatorProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(composeWatchers).where(eq(composeWatchers.id, input.id)).get()
      if (!row) throw new Error('Watcher not found')
      await ctx.db.update(composeWatchers).set({ enabled: input.enabled }).where(eq(composeWatchers.id, input.id))
      if (input.enabled) {
        startWatcher(input.id, {
          projectPath: row.projectPath,
          agentId: row.agentId,
          autoApply: row.autoApply,
          watchInterval: row.watchInterval,
        }, (diff, path) => {
          console.log(`[compose-watcher] ${path} changed:`, diff)
        })
      } else {
        stopWatcher(input.id)
      }
      return { ok: true }
    }),

  deleteComposeWatcher: operatorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      stopWatcher(input.id)
      await ctx.db.delete(composeWatchers).where(eq(composeWatchers.id, input.id))
      return { ok: true }
    }),
})
