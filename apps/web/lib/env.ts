import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1)
});

let cachedEnv: ReturnType<typeof schema.parse> | null = null;

export function getEnv() {
  if (cachedEnv) return cachedEnv;

  // During build time, return placeholder values
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    cachedEnv = {
      DATABASE_URL: "postgres://placeholder",
      REDIS_URL: "redis://placeholder",
      AUTH_SECRET: "placeholder-secret-min-32-chars-long!!"
    };
    return cachedEnv;
  }

  cachedEnv = schema.parse(process.env);
  return cachedEnv;
}
