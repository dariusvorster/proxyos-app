import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Config } from 'drizzle-kit'

const dbPath = resolve(
  process.env.PROXYOS_DB_PATH ?? resolve(process.cwd(), 'data/proxyos.db'),
)
mkdirSync(dirname(dbPath), { recursive: true })

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: dbPath },
} satisfies Config
