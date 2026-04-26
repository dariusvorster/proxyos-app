import { defineConfig } from 'vitest/config'
import { join } from 'path'
import { tmpdir } from 'os'

export default defineConfig({
  test: {
    fileParallelism: false,
    env: {
      PROXYOS_DB_PATH: join(tmpdir(), 'proxyos-api-test.db'),
      PROXYOS_SECRET: 'test-secret-32-chars-minimum-padding-ok',
    },
  },
})
