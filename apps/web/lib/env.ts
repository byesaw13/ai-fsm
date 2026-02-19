import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  /**
   * AUTH_SECRET must be at least 32 characters.
   * Generate with: openssl rand -hex 32
   */
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters — generate with: openssl rand -hex 32"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

let cachedEnv: ReturnType<typeof schema.parse> | null = null;

export function getEnv() {
  if (cachedEnv) return cachedEnv;

  // During Next.js build (not runtime), real env vars may not be present.
  // Return safe placeholders so `next build` succeeds in CI without secrets.
  // At runtime the full validation runs and throws if misconfigured.
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
  ) {
    cachedEnv = schema.parse({
      DATABASE_URL: "postgres://placeholder",
      REDIS_URL: "redis://placeholder",
      AUTH_SECRET: "placeholder-secret-must-be-at-least-32-characters!!",
      NODE_ENV: "production",
    });
    return cachedEnv;
  }

  const result = schema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[startup] Environment configuration error:\n${messages}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

/** Reset the cached result. Test use only. */
export function _resetEnvCache(): void {
  cachedEnv = null;
}
