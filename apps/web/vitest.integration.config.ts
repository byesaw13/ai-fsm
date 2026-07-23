import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 15000,
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules', '.next'],
    // HTTP suites share one server and one seeded owner account; parallel
    // files race on that shared state (clock/day/estimate mutations) and
    // flake. Sequential keeps the tier deterministic.
    fileParallelism: false,
  },
})
