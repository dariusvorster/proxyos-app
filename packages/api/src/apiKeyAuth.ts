import { createHash, randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { apiKeys } from '@proxyos/db'

export type Db = ReturnType<typeof import('@proxyos/db').getDb>

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(): string {
  return `pxos_${randomBytes(24).toString('base64url')}`
}

export async function resolveApiKey(
  db: Db,
  bearerToken: string,
): Promise<{ id: string; scopes: string[] } | null> {
  if (!bearerToken.startsWith('pxos_')) return null
  const hash = hashApiKey(bearerToken)
  const now = new Date()
  const row = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).get()
  if (!row) return null
  if (row.expiresAt && row.expiresAt <= now) return null
  void db.update(apiKeys).set({ lastUsed: now }).where(eq(apiKeys.id, row.id))
  return { id: row.id, scopes: JSON.parse(row.scopes) as string[] }
}
