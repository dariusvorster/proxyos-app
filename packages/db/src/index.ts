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
  sqlite.pragma('foreign_keys = ON')
  ensureSchema(sqlite)
  _db = drizzle(sqlite, { schema })
  return _db
}

export type Db = ReturnType<typeof getDb>
export { schema }
