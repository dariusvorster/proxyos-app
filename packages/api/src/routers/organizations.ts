import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { router, protectedProcedure, adminProcedure } from '../trpc'
import { getDb, organizations, sites, orgMemberships, nanoid } from '@proxyos/db'

export const organizationsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = getDb()
    return db
      .select()
      .from(organizations)
      .where(and(eq(organizations.tenantId, 'tenant_default'), isNull(organizations.archivedAt)))
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = getDb()
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, input.id))
      if (!org) throw new TRPCError({ code: 'NOT_FOUND', message: `Organization with ID '${input.id}' not found` })
      return org
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
    }))
    .mutation(async ({ input }) => {
      const db = getDb()
      const id = `org_${nanoid(12)}`
      const now = new Date()
      await db.insert(organizations).values({
        id,
        tenantId: 'tenant_default',
        name: input.name,
        slug: input.slug,
        createdAt: now,
      })
      return { id }
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb()
      const { id, ...fields } = input
      if (Object.keys(fields).length > 0) {
        await db.update(organizations).set(fields).where(eq(organizations.id, id))
      }
    }),

  archive: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb()
      await db
        .update(organizations)
        .set({ archivedAt: new Date() })
        .where(eq(organizations.id, input.id))
    }),

  listSites: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb()
      return db
        .select()
        .from(sites)
        .where(and(eq(sites.organizationId, input.organizationId), isNull(sites.archivedAt)))
    }),

  listMembers: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb()
      return db
        .select()
        .from(orgMemberships)
        .where(eq(orgMemberships.organizationId, input.organizationId))
    }),

  addMember: adminProcedure
    .input(z.object({
      organizationId: z.string(),
      userId: z.string(),
      role: z.enum(['org_admin', 'org_operator', 'org_viewer']),
    }))
    .mutation(async ({ input }) => {
      const db = getDb()
      await db.insert(orgMemberships).values({
        id: nanoid(),
        tenantId: 'tenant_default',
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        createdAt: new Date(),
      }).onConflictDoUpdate({
        target: [orgMemberships.organizationId, orgMemberships.userId],
        set: { role: input.role },
      })
    }),

  removeMember: adminProcedure
    .input(z.object({ organizationId: z.string(), userId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb()
      await db
        .delete(orgMemberships)
        .where(and(
          eq(orgMemberships.organizationId, input.organizationId),
          eq(orgMemberships.userId, input.userId),
        ))
    }),
})
