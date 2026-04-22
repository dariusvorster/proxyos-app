import { defineConfig } from 'vitest/config'
import { join } from 'path'
import { tmpdir } from 'os'

export default defineConfig({
  test: {
    env: {
      PROXYOS_DB_PATH: join(tmpdir(), 'proxyos-api-test.db'),
    },
  },
})
