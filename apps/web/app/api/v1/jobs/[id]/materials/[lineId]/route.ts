import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const STATUSES = ["needed", "purchased", "on_truck", "not_needed"] as const;

const patchBody = z.object({
  name: z.string().min(1).max(500).optional(),
  quantity: z.number().positive().optional(),
  unit_label: z.string().max(50).nullable().optional(),
  store_section: z.string().max(100).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function idsFromUrl(url: string): { jobId: string; lineId: string } | null {
  const m = url.match(/\/jobs\/([^/]+)\/materials\/([^/?#]+)/);
  if (!m) return null;
  return { jobId: m[1], lineId: m[2] };
}

async function assertJobAccess(
  client: { query: (q: string, p?: unknown[]) => Promise<{ rowCount: number | null }> },
  jobId: string,
  accountId: string,
  role: string,
  userId: string,
): Promise<"ok" | "not_found" | "forbidden"> {
  const job = await client.query(`SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [
    jobId,
    accountId,
  ]);
  if ((job.rowCount ?? 0) === 0) return "not_found";
  if (role === "tech") {
    const assigned = await client.query(
      `SELECT id FROM visits
       WHERE job_id = $1 AND account_id = $2 AND assigned_user_id = $3
       LIMIT 1`,
      [jobId, accountId, userId],
    );
    if ((assigned.rowCount ?? 0) === 0) return "forbidden";
  }
  return "ok";
}

/** PATCH — update line; tech may only change status */
export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const ids = idsFromUrl(request.url);
  if (!ids) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 },
    );
  }

  if (session.role === "tech") {
    const keys = Object.keys(parsed.data);
    if (keys.length !== 1 || parsed.data.status === undefined) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Techs may only update status",
            traceId: session.traceId,
          },
        },
        { status: 403 },
      );
    }
  }

  try {
    return await withDbSession(session, async (client) => {
      const access = await assertJobAccess(
        client,
        ids.jobId,
        session.accountId,
        session.role,
        session.userId,
      );
      if (access === "not_found") {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
          { status: 404 },
        );
      }
      if (access === "forbidden") {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Not assigned to this job", traceId: session.traceId } },
          { status: 403 },
        );
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const [key, val] of Object.entries(parsed.data)) {
        if (val === undefined) continue;
        sets.push(`${key} = $${i++}`);
        params.push(key === "name" && typeof val === "string" ? val.trim() : val);
      }
      if (sets.length === 0) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No fields to update", traceId: session.traceId } },
          { status: 422 },
        );
      }
      params.push(ids.lineId, ids.jobId, session.accountId);
      const r = await client.query(
        `UPDATE job_material_lines
         SET ${sets.join(", ")}
         WHERE id = $${i} AND job_id = $${i + 1} AND account_id = $${i + 2}
         RETURNING *`,
        params,
      );
      if (r.rowCount === 0) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Line not found", traceId: session.traceId } },
          { status: 404 },
        );
      }
      return NextResponse.json({ data: r.rows[0] });
    });
  } catch (err) {
    logger.error("PATCH /api/v1/jobs/[id]/materials/[lineId]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not update line", traceId: session.traceId } },
      { status: 500 },
    );
  }
});

/** DELETE — owner/admin only */
export const DELETE = withAuth(async (request: NextRequest, session: AuthSession) => {
  const ids = idsFromUrl(request.url);
  if (!ids) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } },
      { status: 404 },
    );
  }
  if (session.role === "tech") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Techs cannot delete lines", traceId: session.traceId } },
      { status: 403 },
    );
  }

  try {
    return await withDbSession(session, async (client) => {
      const access = await assertJobAccess(
        client,
        ids.jobId,
        session.accountId,
        session.role,
        session.userId,
      );
      if (access === "not_found") {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
          { status: 404 },
        );
      }
      if (access === "forbidden") {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Not assigned to this job", traceId: session.traceId } },
          { status: 403 },
        );
      }

      const r = await client.query(
        `DELETE FROM job_material_lines
         WHERE id = $1 AND job_id = $2 AND account_id = $3
         RETURNING id`,
        [ids.lineId, ids.jobId, session.accountId],
      );
      if (r.rowCount === 0) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Line not found", traceId: session.traceId } },
          { status: 404 },
        );
      }
      return NextResponse.json({ data: { id: ids.lineId } });
    });
  } catch (err) {
    logger.error("DELETE /api/v1/jobs/[id]/materials/[lineId]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not delete line", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
