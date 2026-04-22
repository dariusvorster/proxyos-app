import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import * as schema from './schema'
import { ensureSchema } from './migrations'

export * from './schema'
export { nanoid } from 'nanoid'

const DB_PATH = resolve(process.env.PROXYOS_DB_PATH ?? resolve(process.cwd(), 'data/proxyos.db'))

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (_db) return _db
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')

  const integrityResult = sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>
  if (integrityResult.length !== 1 || integrityResult[0].integrity_check !== 'ok') {
    throw new Error(
      `[db] SQLite integrity check failed: ${JSON.stringify(integrityResult)}\n` +
      `Database at ${DB_PATH} is corrupt. Restore from backup or delete and let ProxyOS re-initialize.`
    )
  }

  ensureSchema(sqlite)
  _db = drizzle(sqlite, { schema })

  const checkpointInterval = setInterval(() => {
    try {
      sqlite.pragma('wal_checkpoint(PASSIVE)')
    } catch {
      // Non-fatal: WAL file may grow but DB remains consistent
    }
  }, 5 * 60 * 1000)
  checkpointInterval.unref() // Don't keep the process alive just for checkpointing

  return _db
}

export type Db = ReturnType<typeof getDb>
export { schema }
