import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  getClientIp,
  LOGIN_RATE_LIMIT,
  SENSITIVE_RATE_LIMIT,
  GENERAL_RATE_LIMIT,
  _resetStore,
  type RateLimitConfig,
} from "../rate-limit";

beforeEach(() => {
  _resetStore();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// checkRateLimit — basic allow / deny
// ---------------------------------------------------------------------------

describe("checkRateLimit", () => {
  const config: RateLimitConfig = { limit: 3, windowSeconds: 60 };

  it("allows requests within limit", () => {
    const r1 = checkRateLimit("test:ip", config);
    const r2 = checkRateLimit("test:ip", config);
    const r3 = checkRateLimit("test:ip", config);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("denies requests exceeding limit", () => {
    checkRateLimit("test:ip", config);
    checkRateLimit("test:ip", config);
    checkRateLimit("test:ip", config);

    const r4 = checkRateLimit("test:ip", config);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("isolates different keys", () => {
    checkRateLimit("key:a", config);
    checkRateLimit("key:a", config);
    checkRateLimit("key:a", config);
    // key:a is at limit — key:b should still be allowed
    const result = checkRateLimit("key:b", config);
    expect(result.allowed).toBe(true);
  });

  it("returns resetAt in the future", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = checkRateLimit("test:reset", config);
    expect(result.resetAt).toBeGreaterThan(nowSeconds);
  });

  it("slides the window — old entries expire and allow new requests", () => {
    const shortConfig: RateLimitConfig = { limit: 2, windowSeconds: 10 };
    checkRateLimit("slide:ip", shortConfig);
    checkRateLimit("slide:ip", shortConfig);
    // At limit now

    expect(checkRateLimit("slide:ip", shortConfig).allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(11_000);

    const after = checkRateLimit("slide:ip", shortConfig);
    expect(after.allowed).toBe(true);
  });

  it("remaining counts down correctly", () => {
    const r1 = checkRateLimit("count:ip", config);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit("count:ip", config);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit("count:ip", config);
    expect(r3.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getClientIp
// ---------------------------------------------------------------------------

describe("getClientIp", () => {
  it("returns first IP from X-Forwarded-For", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it('returns "unknown" when no IP headers present', () => {
    const req = new Request("http://localhost/");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from forwarded IP", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "  10.0.0.1  , 192.168.0.1" },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });
});

// ---------------------------------------------------------------------------
// Preset configs — sanity checks
// ---------------------------------------------------------------------------

describe("preset configs", () => {
  it("LOGIN_RATE_LIMIT allows 5 requests then denies", () => {
    _resetStore();
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i++) {
      expect(checkRateLimit("login:x", LOGIN_RATE_LIMIT).allowed).toBe(true);
    }
    expect(checkRateLimit("login:x", LOGIN_RATE_LIMIT).allowed).toBe(false);
  });

  it("SENSITIVE_RATE_LIMIT has higher limit than LOGIN", () => {
    expect(SENSITIVE_RATE_LIMIT.limit).toBeGreaterThan(LOGIN_RATE_LIMIT.limit);
  });

  it("GENERAL_RATE_LIMIT has higher limit than SENSITIVE", () => {
    expect(GENERAL_RATE_LIMIT.limit).toBeGreaterThan(
      SENSITIVE_RATE_LIMIT.limit
    );
  });
});
