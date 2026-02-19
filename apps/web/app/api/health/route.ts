/**
 * GET /api/health
 *
 * Health + readiness endpoint.
 *
 * Semantics:
 *   200 { status: "ok",      checks: { db: "ok"   }, ... }  — fully healthy
 *   503 { status: "degraded", checks: { db: "fail" }, ... } — at least one check failed
 *
 * Used by:
 *   - Docker Compose healthcheck (compose.prod.yml, compose.pi.yml)
 *   - Load balancer / reverse proxy liveness probe
 *   - Uptime monitors
 *
 * The DB check runs a lightweight `SELECT 1` on a pooled connection.
 * The pool is reused across requests (no new client per call).
 */

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "fail";

interface HealthResponse {
  status: "ok" | "degraded";
  service: "web";
  checks: {
    db: CheckStatus;
  };
  ts: string;
}

async function checkDb(): Promise<CheckStatus> {
  try {
    await getPool().query("SELECT 1");
    return "ok";
  } catch (err) {
    logger.error("health: db check failed", err);
    return "fail";
  }
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const db = await checkDb();

  const allOk = db === "ok";
  const body: HealthResponse = {
    status: allOk ? "ok" : "degraded",
    service: "web",
    checks: { db },
    ts: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
