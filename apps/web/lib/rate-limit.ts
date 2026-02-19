/**
 * In-process sliding-window rate limiter.
 *
 * Uses a Map<key, number[]> where each value is an array of epoch-second
 * timestamps for recent requests. Expired entries are pruned on each access.
 *
 * This is appropriate for the current single-process standalone deployment
 * (VPS / Pi4). If multi-replica deployment is introduced, swap the store
 * for Redis sorted-set operations (see ADR-008 for details).
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the sliding window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in current window (0 when denied) */
  remaining: number;
  /** Unix epoch seconds when the window resets for this key */
  resetAt: number;
}

/* ------------------------------------------------------------------ */
/*  In-process store                                                   */
/* ------------------------------------------------------------------ */

const store = new Map<string, number[]>();

// Periodically prune keys that have had no activity to prevent unbounded growth.
// 10-minute sweep is generous – idle keys naturally shrink on next access too.
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;

let pruneTimer: ReturnType<typeof setInterval> | null = null;

function ensurePruneTimer(): void {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    for (const [key, timestamps] of store.entries()) {
      // Prune all entries (longest window we have is 15 min = 900 s)
      const fresh = timestamps.filter((t) => nowSeconds - t < 900);
      if (fresh.length === 0) {
        store.delete(key);
      } else {
        store.set(key, fresh);
      }
    }
  }, PRUNE_INTERVAL_MS);
  // Don't block process exit
  if (pruneTimer.unref) pruneTimer.unref();
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Check and increment the rate-limit counter for `key`.
 *
 * The counter is a sliding window: only requests within the last
 * `windowSeconds` are counted.
 *
 * @param key - Unique key, e.g. `login:${ip}` or `api:${ip}`
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  ensurePruneTimer();

  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - config.windowSeconds;

  // Prune expired + append current
  const prev = (store.get(key) ?? []).filter((t) => t > windowStart);
  prev.push(nowSeconds);
  store.set(key, prev);

  const count = prev.length;
  const allowed = count <= config.limit;
  const remaining = Math.max(0, config.limit - count);
  // Reset time: when the oldest entry in the current window expires
  const oldest = prev[0] ?? nowSeconds;
  const resetAt = oldest + config.windowSeconds;

  return { allowed, remaining, resetAt };
}

/**
 * Extract the best-effort client IP from request headers.
 * Trusts X-Forwarded-For (set by reverse proxies like nginx).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/* ------------------------------------------------------------------ */
/*  Preset rate-limit configurations                                  */
/* ------------------------------------------------------------------ */

/** Login endpoint: 5 attempts per 15 minutes per IP */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  limit: 5,
  windowSeconds: 15 * 60,
};

/** Sensitive mutations (transitions, payments): 30 requests/minute per IP */
export const SENSITIVE_RATE_LIMIT: RateLimitConfig = {
  limit: 30,
  windowSeconds: 60,
};

/** General API: 120 requests/minute per IP */
export const GENERAL_RATE_LIMIT: RateLimitConfig = {
  limit: 120,
  windowSeconds: 60,
};

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

/** Clear the in-process store. Test use only. */
export function _resetStore(): void {
  store.clear();
}
