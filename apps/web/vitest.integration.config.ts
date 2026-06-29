import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15000,
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules', '.next'],
  },
})
