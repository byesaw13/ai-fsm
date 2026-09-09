import { defineConfig } from 'vitest/config'

if (process.env.CI && (!process.env.TEST_DATABASE_URL)) {
  throw new Error("CI integration tests require TEST_DATABASE_URL");
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
  },
})
