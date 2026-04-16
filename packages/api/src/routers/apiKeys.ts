import { createHash, randomBytes } from 'crypto'
import { and, desc, eq, isNull, gt } from 'drizzle-orm'
import { z } from 'zod'
import { apiKeys, nanoid } from '@proxyos/db'
import { publicProcedure, router } from '../trpc'

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(): string {
  return `pak_${randomBytes(24).toString('base64url')}`
}

export async function resolveApiKey(
  db: import('@proxyos/db').Db,
  bearerToken: string,
): Promise<{ id: string; scopes: string[] } | null> {
  if (!bearerToken.startsWith('pak_')) return null
  const hash = hashApiKey(bearerToken)
  const now = new Date()
  const row = await db.select().from(apiKeys).where(
    and(
      eq(apiKeys.keyHash, hash),
      // not expired
    ),
  ).get()
  if (!row) return null
  if (row.expiresAt && row.expiresAt <= now) return null
  // Update last used (fire and forget)
  void db.update(apiKeys).set({ lastUsed: now }).where(eq(apiKeys.id, row.id))
  return { id: row.id, scopes: JSON.parse(row.scopes) as string[] }
}

const VALID_SCOPES = ['read', 'routes', 'agents', 'connections', 'admin'] as const

export const apiKeysRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)).all()
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      scopes: JSON.parse(r.scopes) as string[],
      lastUsed: r.lastUsed,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }))
  }),

  create: publicProcedure
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
      return { id, key } // key shown ONCE — not stored in plain text
    }),

  revoke: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(apiKeys).where(eq(apiKeys.id, input.id))
      return { ok: true }
    }),
})
