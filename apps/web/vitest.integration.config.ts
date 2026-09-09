import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

if (process.env.CI && (!process.env.TEST_DATABASE_URL || !process.env.TEST_BASE_URL)) {
  throw new Error("CI integration tests require TEST_DATABASE_URL and TEST_BASE_URL");
}

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
