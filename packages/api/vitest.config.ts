import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    env: {
      // Required by src/auth.ts at module load time — prevents process.exit(1)
      PROXYOS_SECRET: 'test-secret-for-unit-tests-do-not-use-in-production-32x',
      PROXYOS_DB_PATH: ':memory:',
    },
  },
  ssr: {
    // Do not bundle better-sqlite3 — let Node require() the native addon directly
    external: ['better-sqlite3'],
  },
})
