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
  /**
   * Paperless-ngx integration — optional.
   * If omitted, the document panel degrades gracefully (shows cached link
   * metadata only; live Paperless search/fetch is disabled).
   *
   * PAPERLESS_URL: base URL of your Paperless-ngx instance
   *   e.g. http://192.168.1.10:8000
   * PAPERLESS_API_TOKEN: API token from Paperless Settings → API Authentication
   */
  PAPERLESS_URL: z.string().url().optional(),
  PAPERLESS_API_TOKEN: z.string().optional(),
  /**
   * Homebox integration — optional.
   * If omitted, the asset panel degrades gracefully (cached data only).
   *
   * HOMEBOX_URL: base URL of your Homebox instance
   *   e.g. http://172.20.0.1:3100
   * HOMEBOX_USER: Homebox login email
   * HOMEBOX_PASSWORD: Homebox login password
   */
  HOMEBOX_URL: z.string().url().optional(),
  HOMEBOX_USER: z.string().optional(),
  HOMEBOX_PASSWORD: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  /**
   * Account used by the public booking page when unauthenticated customers
   * submit intake requests.
   */
  BOOKING_ACCOUNT_ID: z.string().uuid().optional(),
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
