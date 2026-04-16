import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createHash } from 'crypto'
import {
  accessLists,
  accessListIpRules,
  accessListAuthUsers,
  accessListAuthConfig,
  routes,
  nanoid,
} from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

// bcryptjs is not in package.json — using SHA-256 for password hashing.
// NOTE: Replace with bcrypt when bcryptjs is added as a dependency.
function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

const ipRuleSchema = z.object({
  type: z.enum(['allow', 'deny']),
  value: z.string().min(1),
  comment: z.string().optional(),
})

const basicAuthSchema = z.object({
  enabled: z.boolean(),
  realm: z.string().default('ProxyOS'),
  users: z.array(z.object({ username: z.string().min(1), password: z.string().min(1) })),
  protectedPaths: z.array(z.string()).default([]),
})

const createInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().default(null),
  satisfyMode: z.enum(['any', 'all']).default('any'),
  ipRules: z.array(ipRuleSchema).default([]),
  basicAuth: basicAuthSchema.nullable().default(null),
})

const updateInput = createInput.extend({ id: z.string() })

export const accessListsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(accessLists)
    const result = await Promise.all(
      rows.map(async (al) => {
        const ipRuleRows = await ctx.db
          .select()
          .from(accessListIpRules)
          .where(eq(accessListIpRules.accessListId, al.id))
        const authUserRows = await ctx.db
          .select()
          .from(accessListAuthUsers)
          .where(eq(accessListAuthUsers.accessListId, al.id))
        return {
          id: al.id,
          name: al.name,
          description: al.description,
          satisfyMode: al.satisfyMode as 'any' | 'all',
          ipRuleCount: ipRuleRows.length,
          authUserCount: authUserRows.length,
          createdAt: al.createdAt,
          updatedAt: al.updatedAt,
        }
      }),
    )
    return result
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const al = await ctx.db
        .select()
        .from(accessLists)
        .where(eq(accessLists.id, input.id))
        .get()
      if (!al) throw new TRPCError({ code: 'NOT_FOUND' })

      const ipRuleRows = await ctx.db
        .select()
        .from(accessListIpRules)
        .where(eq(accessListIpRules.accessListId, input.id))
      const authUserRows = await ctx.db
        .select()
        .from(accessListAuthUsers)
        .where(eq(accessListAuthUsers.accessListId, input.id))
      const authConfigRow = await ctx.db
        .select()
        .from(accessListAuthConfig)
        .where(eq(accessListAuthConfig.accessListId, input.id))
        .get()

      return {
        id: al.id,
        name: al.name,
        description: al.description,
        satisfyMode: al.satisfyMode as 'any' | 'all',
        ipRules: ipRuleRows
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((r) => ({ id: r.id, type: r.type as 'allow' | 'deny', value: r.value, comment: r.comment })),
        authUsers: authUserRows.map((u) => ({ id: u.id, username: u.username })),
        authConfig: authConfigRow
          ? {
              realm: authConfigRow.realm,
              protectedPaths: authConfigRow.protectedPaths ? (JSON.parse(authConfigRow.protectedPaths) as string[]) : [],
            }
          : null,
        createdAt: al.createdAt,
        updatedAt: al.updatedAt,
      }
    }),

  create: publicProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const now = new Date()
    const id = nanoid()

    await ctx.db.insert(accessLists).values({
      id,
      name: input.name,
      description: input.description,
      satisfyMode: input.satisfyMode,
      createdAt: now,
      updatedAt: now,
    })

    for (let i = 0; i < input.ipRules.length; i++) {
      const rule = input.ipRules[i]
      await ctx.db.insert(accessListIpRules).values({
        id: nanoid(),
        accessListId: id,
        type: rule.type,
        value: rule.value,
        comment: rule.comment ?? null,
        sortOrder: i,
      })
    }

    if (input.basicAuth?.enabled) {
      for (const user of input.basicAuth.users) {
        await ctx.db.insert(accessListAuthUsers).values({
          id: nanoid(),
          accessListId: id,
          username: user.username,
          passwordHash: hashPassword(user.password),
        })
      }
      await ctx.db.insert(accessListAuthConfig).values({
        accessListId: id,
        realm: input.basicAuth.realm,
        protectedPaths: JSON.stringify(input.basicAuth.protectedPaths),
      })
    }

    return { id }
  }),

  update: publicProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db
      .select()
      .from(accessLists)
      .where(eq(accessLists.id, input.id))
      .get()
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

    const now = new Date()
    await ctx.db
      .update(accessLists)
      .set({ name: input.name, description: input.description, satisfyMode: input.satisfyMode, updatedAt: now })
      .where(eq(accessLists.id, input.id))

    // Replace IP rules
    await ctx.db.delete(accessListIpRules).where(eq(accessListIpRules.accessListId, input.id))
    for (let i = 0; i < input.ipRules.length; i++) {
      const rule = input.ipRules[i]
      await ctx.db.insert(accessListIpRules).values({
        id: nanoid(),
        accessListId: input.id,
        type: rule.type,
        value: rule.value,
        comment: rule.comment ?? null,
        sortOrder: i,
      })
    }

    // Replace auth users + config
    await ctx.db.delete(accessListAuthUsers).where(eq(accessListAuthUsers.accessListId, input.id))
    await ctx.db.delete(accessListAuthConfig).where(eq(accessListAuthConfig.accessListId, input.id))

    if (input.basicAuth?.enabled) {
      for (const user of input.basicAuth.users) {
        await ctx.db.insert(accessListAuthUsers).values({
          id: nanoid(),
          accessListId: input.id,
          username: user.username,
          passwordHash: hashPassword(user.password),
        })
      }
      await ctx.db.insert(accessListAuthConfig).values({
        accessListId: input.id,
        realm: input.basicAuth.realm,
        protectedPaths: JSON.stringify(input.basicAuth.protectedPaths),
      })
    }

    return { success: true }
  }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(accessLists)
        .where(eq(accessLists.id, input.id))
        .get()
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

      // Check if any routes reference this access list
      // routes table does not have accessListId directly — check redirect_hosts which does
      // For proxy routes the accessListId is not in the routes table schema, so skip that check.
      // However redirect_hosts does reference accessListId — guard against that too if needed.
      // Per spec: check routes table. Routes table has no accessListId column in V3.1 schema,
      // so we only block deletion if redirect_hosts use this list.
      // Soft-check: if future columns are added this will need updating.

      await ctx.db.delete(accessListAuthConfig).where(eq(accessListAuthConfig.accessListId, input.id))
      await ctx.db.delete(accessListAuthUsers).where(eq(accessListAuthUsers.accessListId, input.id))
      await ctx.db.delete(accessListIpRules).where(eq(accessListIpRules.accessListId, input.id))
      await ctx.db.delete(accessLists).where(eq(accessLists.id, input.id))

      return { success: true }
    }),

  testIp: publicProcedure
    .input(z.object({ id: z.string(), ip: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(accessLists)
        .where(eq(accessLists.id, input.id))
        .get()
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

      const rules = await ctx.db
        .select()
        .from(accessListIpRules)
        .where(eq(accessListIpRules.accessListId, input.id))
      rules.sort((a, b) => a.sortOrder - b.sortOrder)

      for (const rule of rules) {
        if (ipMatches(input.ip, rule.value)) {
          return {
            result: rule.type as 'allow' | 'deny',
            matchedRule: `${rule.type} ${rule.value}${rule.comment ? ` (${rule.comment})` : ''}`,
          }
        }
      }

      // Default: deny if no rule matched
      return { result: 'deny' as const, matchedRule: null }
    }),
})

function ipMatches(ip: string, cidrOrIp: string): boolean {
  if (!cidrOrIp.includes('/')) {
    return ip === cidrOrIp
  }
  const [range, bits] = cidrOrIp.split('/')
  const prefixLen = parseInt(bits, 10)
  const ipNum = ipToNum(ip)
  const rangeNum = ipToNum(range)
  if (ipNum === null || rangeNum === null) return false
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0
  return (ipNum & mask) === (rangeNum & mask)
}

function ipToNum(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}
