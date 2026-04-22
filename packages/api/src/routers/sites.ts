import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { router, protectedProcedure, adminProcedure } from '../trpc'
import { getDb, sites, siteMemberships, nanoid } from '@proxyos/db'

export const sitesRouter = router({
  list: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb()
      return db
        .select()
        .from(sites)
        .where(and(eq(sites.organizationId, input.organizationId), isNull(sites.archivedAt)))
    }),

  listAll: protectedProcedure.query(async () => {
    const db = getDb()
    return db.select().from(sites).where(isNull(sites.archivedAt))
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = getDb()
      const [site] = await db.select().from(sites).where(eq(sites.id, input.id))
      if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: `Site with ID '${input.id}' not found` })
      return site
    }),

  create: adminProcedure
    .input(z.object({
      organizationId: z.string(),
      name: z.string().min(1).max(100),
      slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
      description: z.string().max(300).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb()
      const id = `site_${nanoid(12)}`
      const now = new Date()
      await db.insert(sites).values({
        id,
        tenantId: 'tenant_default',
        organizationId: input.organizationId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        createdAt: now,
      })
      return { id }
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(300).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb()
      const { id, ...fields } = input
      if (Object.keys(fields).length > 0) {
        await db.update(sites).set(fields).where(eq(sites.id, id))
      }
    }),

  archive: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb()
      await db
        .update(sites)
        .set({ archivedAt: new Date() })
        .where(eq(sites.id, input.id))
    }),

  listMembers: protectedProcedure
    .input(z.object({ siteId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb()
      return db.select().from(siteMemberships).where(eq(siteMemberships.siteId, input.siteId))
    }),

  addMember: adminProcedure
    .input(z.object({
      siteId: z.string(),
      userId: z.string(),
      role: z.enum(['site_operator', 'site_viewer']),
    }))
    .mutation(async ({ input }) => {
      const db = getDb()
      await db.insert(siteMemberships).values({
        id: nanoid(),
        tenantId: 'tenant_default',
        siteId: input.siteId,
        userId: input.userId,
        role: input.role,
        createdAt: new Date(),
      }).onConflictDoUpdate({
        target: [siteMemberships.siteId, siteMemberships.userId],
        set: { role: input.role },
      })
    }),

  removeMember: adminProcedure
    .input(z.object({ siteId: z.string(), userId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb()
      await db
        .delete(siteMemberships)
        .where(and(
          eq(siteMemberships.siteId, input.siteId),
          eq(siteMemberships.userId, input.userId),
        ))
    }),
})
