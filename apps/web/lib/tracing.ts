import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Extract or generate a trace ID for the current request.
 *
 * Priority order:
 *   1. x-trace-id header (set by upstream proxy / client)
 *   2. x-request-id header (common alternative)
 *   3. Freshly generated UUID (fallback)
 *
 * The same trace ID should be used consistently throughout the entire
 * request lifecycle: auth checks, business logic, audit log writes,
 * and all error responses.
 */
export function getTraceId(request: NextRequest): string {
  return (
    request.headers.get("x-trace-id") ??
    request.headers.get("x-request-id") ??
    randomUUID()
  );
}
