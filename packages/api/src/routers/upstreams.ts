import { z } from 'zod'
import { eq, like } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { nanoid, staticUpstreams, routes } from '@proxyos/db'
import { router, protectedProcedure } from '../trpc'

const upstreamSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits, and hyphens only').min(1).max(63),
  host: z.string().min(1).max(255),
  defaultPort: z.number().int().min(1).max(65535).optional(),
  defaultScheme: z.enum(['http', 'https']).default('http'),
  description: z.string().max(500).optional(),
  tlsSkipVerify: z.boolean().default(false),
  healthCheckPath: z.string().max(255).optional(),
})

export const upstreamsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(staticUpstreams).orderBy(staticUpstreams.name)
  }),

  create: protectedProcedure
    .input(upstreamSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(staticUpstreams).where(eq(staticUpstreams.name, input.name))
      if (existing.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: `Upstream "${input.name}" already exists.` })
      }
      const now = new Date()
      const id = nanoid()
      await ctx.db.insert(staticUpstreams).values({
        id,
        name: input.name,
        host: input.host,
        defaultPort: input.defaultPort,
        defaultScheme: input.defaultScheme,
        description: input.description,
        tlsSkipVerify: input.tlsSkipVerify,
        healthCheckPath: input.healthCheckPath,
        createdAt: now,
        updatedAt: now,
      })
      return { id }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(upstreamSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const now = new Date()
      await ctx.db.update(staticUpstreams).set({ ...rest, updatedAt: now }).where(eq(staticUpstreams.id, id))
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const upstream = await ctx.db.select().from(staticUpstreams).where(eq(staticUpstreams.id, input.id))
      if (!upstream[0]) throw new TRPCError({ code: 'NOT_FOUND' })

      const used = await ctx.db.select().from(routes).where(like(routes.upstreams, `%${upstream[0].name}%`))
      if (used.length > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `"${upstream[0].name}" is referenced by ${used.length} route(s). Update those routes first.`,
        })
      }
      await ctx.db.delete(staticUpstreams).where(eq(staticUpstreams.id, input.id))
    }),

  suggest: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(staticUpstreams).orderBy(staticUpstreams.name)
  }),
})
