import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { apiKeys, nanoid } from '@proxyos/db'
import { adminProcedure, router } from '../trpc'
import { hashApiKey, generateApiKey } from '../apiKeyAuth'

export { hashApiKey, generateApiKey } from '../apiKeyAuth'
export { resolveApiKey } from '../apiKeyAuth'

const VALID_SCOPES = [
  // Legacy broad scopes
  'read', 'routes', 'agents', 'connections', 'admin',
  // Fine-grained read scopes (for InfraOS and machine integrations)
  'health:read',
  'routes:read',
  'certs:read',
  'analytics:read',
  // Write scopes (reserved for future use)
  'routes:write',
  'certs:write',
] as const

export const apiKeysRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)).all()
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      prefix: r.name, // display hint — actual prefix is first 12 chars of key shown on create
      scopes: JSON.parse(r.scopes) as string[],
      lastUsed: r.lastUsed,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }))
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(64),
      scopes: z.array(z.enum(VALID_SCOPES)).min(1),
      expiresInDays: z.number().min(1).max(3650).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const key = generateApiKey()
      const id = nanoid()
      const now = new Date()
      const expiresAt = input.expiresInDays
        ? new Date(now.getTime() + input.expiresInDays * 86_400_000)
        : null
      await ctx.db.insert(apiKeys).values({
        id,
        name: input.name,
        keyHash: hashApiKey(key),
        scopes: JSON.stringify(input.scopes),
        expiresAt,
        createdAt: now,
      })
      return { id, key } // key shown ONCE — never stored in plain text
    }),

  revoke: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(apiKeys).where(eq(apiKeys.id, input.id))
      return { ok: true }
    }),
})
