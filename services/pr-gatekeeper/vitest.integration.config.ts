import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Spinning up temp git repos + worktrees is slower than a unit test.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
