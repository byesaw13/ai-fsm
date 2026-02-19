import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getEnv, _resetEnvCache } from "../env";

const VALID_ENV = {
  DATABASE_URL: "postgres://test:test@localhost/test",
  REDIS_URL: "redis://localhost:6379/0",
  AUTH_SECRET: "this-is-a-valid-secret-exactly-32-chars!",
  NODE_ENV: "test",
};

const ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "AUTH_SECRET",
  "NODE_ENV",
  "NEXT_PHASE",
] as const;

describe("getEnv validation", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    _resetEnvCache();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    _resetEnvCache();
  });

  it("throws a descriptive error when AUTH_SECRET is too short", () => {
    Object.assign(process.env, { ...VALID_ENV, AUTH_SECRET: "tooshort" });
    expect(() => getEnv()).toThrow(/AUTH_SECRET must be at least 32 characters/);
  });

  it("throws when DATABASE_URL is missing", () => {
    Object.assign(process.env, { ...VALID_ENV });
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });

  it("throws when REDIS_URL is missing", () => {
    Object.assign(process.env, { ...VALID_ENV });
    delete process.env.REDIS_URL;
    expect(() => getEnv()).toThrow(/REDIS_URL/);
  });

  it("returns parsed env when all values are valid", () => {
    Object.assign(process.env, VALID_ENV);
    const env = getEnv();
    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.AUTH_SECRET).toBe(VALID_ENV.AUTH_SECRET);
  });

  it("error message includes [startup] prefix for visibility", () => {
    Object.assign(process.env, { ...VALID_ENV, AUTH_SECRET: "x" });
    expect(() => getEnv()).toThrow(/\[startup\]/);
  });

  it("build-time bypass activates when NEXT_PHASE=phase-production-build", () => {
    // No DATABASE_URL set — would normally throw
    process.env.NEXT_PHASE = "phase-production-build";
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().DATABASE_URL).toBe("postgres://placeholder");
  });

  it("caches the result on second call", () => {
    Object.assign(process.env, VALID_ENV);
    const first = getEnv();
    const second = getEnv();
    expect(first).toBe(second);
  });
});
