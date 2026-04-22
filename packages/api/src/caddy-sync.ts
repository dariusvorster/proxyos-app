import type { Db } from '@proxyos/db'

interface SyncOperation<T> {
  /** Human-readable label for error messages */
  label: string
  /** Runs inside the DB transaction. Must NOT call Caddy directly. Returns the DB result. */
  dbOperation: (tx: Db) => Promise<T>
  /** Called with the DB result while still inside the transaction.
   *  If this throws, drizzle rolls back the DB write automatically. */
  caddyOperation: (result: T) => Promise<void>
}

/**
 * Two-phase commit: DB write and Caddy push happen inside a single drizzle
 * transaction. If caddyOperation throws, drizzle rolls back the DB write before
 * the transaction commits, keeping DB and Caddy consistent.
 *
 * SQLite note: drizzle does NOT commit until the async callback resolves, so
 * the Caddy HTTP call runs before the commit — this is the correct atomicity window.
 */
export async function withCaddySync<T>(db: Db, op: SyncOperation<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const result = await op.dbOperation(tx as Db)
      await op.caddyOperation(result)
      return result
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Re-throw with label context so callers get a meaningful error
    const wrapped = new Error(`[caddy-sync] ${op.label}: ${msg}`)
    wrapped.cause = err
    throw wrapped
  }
}
