import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid, routeTemplates } from '@proxyos/db'
import { BUILT_IN_TEMPLATES } from '../automation/built-in-templates'
import { publicProcedure, router } from '../trpc'

export const templatesRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const userRows = await ctx.db.select().from(routeTemplates).all()
    const user = userRows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      config: JSON.parse(r.config) as Record<string, unknown>,
      builtIn: r.builtIn === 1,
      createdAt: r.createdAt,
    }))
    const builtIn = BUILT_IN_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      config: t.config as Record<string, unknown>,
      builtIn: true,
      createdAt: new Date(0),
    }))
    return [...builtIn, ...user]
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const builtin = BUILT_IN_TEMPLATES.find(t => t.id === input.id)
      if (builtin) return { ...builtin, config: builtin.config as Record<string, unknown>, builtIn: true, createdAt: new Date(0) }
      const row = await ctx.db.select().from(routeTemplates).where(eq(routeTemplates.id, input.id)).get()
      if (!row) return null
      return { id: row.id, name: row.name, description: row.description ?? '', config: JSON.parse(row.config) as Record<string, unknown>, builtIn: false, createdAt: row.createdAt }
    }),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(64),
      description: z.string().max(256).optional(),
      config: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid()
      const now = new Date()
      await ctx.db.insert(routeTemplates).values({
        id,
        name: input.name,
        description: input.description ?? null,
        config: JSON.stringify(input.config),
        builtIn: 0,
        createdAt: now,
      })
      return { id }
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (BUILT_IN_TEMPLATES.some(t => t.id === input.id)) {
        throw new Error('Cannot delete built-in templates')
      }
      await ctx.db.delete(routeTemplates).where(eq(routeTemplates.id, input.id))
      return { ok: true }
    }),
})
