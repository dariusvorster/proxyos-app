import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { nanoid, tenants, userTenants, users } from '@proxyos/db'
import { adminProcedure, protectedProcedure, router } from '../trpc'

export const tenantsRouter = router({

  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(tenants).all()
    const memberCounts = await ctx.db.select().from(userTenants).all()
    return rows.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      logoUrl: t.logoUrl,
      accentColor: t.accentColor,
      subdomain: t.subdomain,
      createdAt: t.createdAt,
      memberCount: memberCounts.filter(m => m.tenantId === t.id).length,
    }))
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(80),
      slug: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
      logoUrl: z.string().url().nullable().optional(),
      accentColor: z.string().nullable().optional(),
      subdomain: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug)).get()
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Slug already taken' })
      const id = nanoid()
      await ctx.db.insert(tenants).values({
        id,
        name: input.name,
        slug: input.slug,
        logoUrl: input.logoUrl ?? null,
        accentColor: input.accentColor ?? null,
        subdomain: input.subdomain ?? null,
        createdAt: new Date(),
      })
      return { id }
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(80).optional(),
      logoUrl: z.string().url().nullable().optional(),
      accentColor: z.string().nullable().optional(),
      subdomain: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const update: Partial<typeof fields> = {}
      if (fields.name !== undefined) (update as Record<string, unknown>).name = fields.name
      if (fields.logoUrl !== undefined) (update as Record<string, unknown>).logoUrl = fields.logoUrl
      if (fields.accentColor !== undefined) (update as Record<string, unknown>).accentColor = fields.accentColor
      if (fields.subdomain !== undefined) (update as Record<string, unknown>).subdomain = fields.subdomain
      await ctx.db.update(tenants).set(update).where(eq(tenants.id, id))
      return { ok: true }
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(tenants).where(eq(tenants.id, input.id))
      return { ok: true }
    }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db
      .select()
      .from(userTenants)
      .where(eq(userTenants.userId, ctx.session.userId))
      .all()
    if (memberships.length === 0) return []
    const ids = memberships.map(m => m.tenantId)
    const all = await ctx.db.select().from(tenants).all()
    return all
      .filter(t => ids.includes(t.id))
      .map(t => ({
        ...t,
        role: memberships.find(m => m.tenantId === t.id)!.role as 'admin' | 'user',
      }))
  }),

  getMembers: adminProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ ctx, input }) => {
      const memberships = await ctx.db
        .select()
        .from(userTenants)
        .where(eq(userTenants.tenantId, input.tenantId))
        .all()
      const allUsers = await ctx.db.select().from(users).all()
      return memberships.map(m => {
        const u = allUsers.find(u => u.id === m.userId)
        return {
          userId: m.userId,
          email: u?.email ?? '(unknown)',
          displayName: u?.displayName ?? null,
          role: m.role as 'admin' | 'user',
          joinedAt: m.joinedAt,
        }
      })
    }),

  addMember: adminProcedure
    .input(z.object({
      tenantId: z.string(),
      userId: z.string(),
      role: z.enum(['admin', 'user']).default('user'),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(userTenants)
        .where(and(eq(userTenants.tenantId, input.tenantId), eq(userTenants.userId, input.userId)))
        .get()
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'User is already a member' })
      await ctx.db.insert(userTenants).values({
        userId: input.userId,
        tenantId: input.tenantId,
        role: input.role,
        joinedAt: new Date(),
      })
      return { ok: true }
    }),

  removeMember: adminProcedure
    .input(z.object({ tenantId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(userTenants)
        .where(and(eq(userTenants.tenantId, input.tenantId), eq(userTenants.userId, input.userId)))
      return { ok: true }
    }),

  setMemberRole: adminProcedure
    .input(z.object({
      tenantId: z.string(),
      userId: z.string(),
      role: z.enum(['admin', 'user']),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(userTenants)
        .set({ role: input.role })
        .where(and(eq(userTenants.tenantId, input.tenantId), eq(userTenants.userId, input.userId)))
      return { ok: true }
    }),
})
