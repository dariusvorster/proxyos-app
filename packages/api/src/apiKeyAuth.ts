import { createHash, createHmac, randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { apiKeys } from '@proxyos/db'

export type Db = ReturnType<typeof import('@proxyos/db').getDb>

function hmacHash(key: string): string {
  const secret = process.env.PROXYOS_SECRET
  if (!secret) throw new Error('PROXYOS_SECRET environment variable must be set')
  return createHmac('sha256', secret).update(key).digest('hex')
}

function sha256Hash(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// New keys are hashed with HMAC-SHA256
export function hashApiKey(key: string): string {
  return hmacHash(key)
}

export function generateApiKey(): string {
  return `pxos_${randomBytes(24).toString('base64url')}`
}

export async function resolveApiKey(
  db: Db,
  bearerToken: string,
): Promise<{ id: string; scopes: string[] } | null> {
  if (!bearerToken.startsWith('pxos_')) return null
  const now = new Date()

  // Try HMAC hash first (current scheme)
  const hmac = hmacHash(bearerToken)
  let row = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hmac)).get()

  if (!row) {
    // Fall back to legacy SHA-256 hash and auto-migrate on match
    const legacy = sha256Hash(bearerToken)
    const legacyRow = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, legacy)).get()
    if (legacyRow) {
      // Upgrade stored hash to HMAC in-place
      void db.update(apiKeys).set({ keyHash: hmac, lastUsed: now }).where(eq(apiKeys.id, legacyRow.id))
      row = { ...legacyRow, keyHash: hmac }
    }
  }

  if (!row) return null
  if (row.expiresAt && row.expiresAt <= now) return null
  void db.update(apiKeys).set({ lastUsed: now }).where(eq(apiKeys.id, row.id))
  return { id: row.id, scopes: JSON.parse(row.scopes) as string[] }
}
