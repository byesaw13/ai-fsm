import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { seedJobBuyList } from "@/lib/jobs/buy-list-seed";

export const dynamic = "force-dynamic";

const STATUSES = ["needed", "purchased", "on_truck", "not_needed"] as const;
const SOURCES = ["estimate", "kit", "ai", "manual"] as const;

const createBody = z.object({
  name: z.string().min(1).max(500),
  quantity: z.number().positive().optional().default(1),
  unit_label: z.string().max(50).nullable().optional(),
  store_section: z.string().max(100).nullable().optional(),
  status: z.enum(STATUSES).optional().default("needed"),
  notes: z.string().max(2000).nullable().optional(),
});

const seedBody = z.object({
  reseed: z.boolean().optional().default(false),
});

function jobIdFromUrl(url: string): string | null {
  // /api/v1/jobs/<id>/materials
  const m = url.match(/\/jobs\/([^/]+)\/materials/);
  return m?.[1] ?? null;
}

async function assertJob(
  client: { query: (q: string, p?: unknown[]) => Promise<{ rowCount: number | null; rows: unknown[] }> },
  jobId: string,
  accountId: string,
): Promise<boolean> {
  const r = await client.query(`SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [
    jobId,
    accountId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

/** GET — list buy list lines for job */
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const jobId = jobIdFromUrl(request.url);
  if (!jobId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
      { status: 404 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );
    if (!(await assertJob(client, jobId, session.accountId))) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 },
      );
    }

    const meta = await client.query<{
      materials_plan_seeded_at: string | null;
      materials_plan_seed_estimate_id: string | null;
    }>(
      `SELECT materials_plan_seeded_at, materials_plan_seed_estimate_id
       FROM jobs WHERE id = $1 AND account_id = $2`,
      [jobId, session.accountId],
    );

    const lines = await client.query(
      `SELECT id, name, quantity, unit_label, store_section, status, source,
              catalog_material_id, sku, notes, sort_order, created_at, updated_at
       FROM job_material_lines
       WHERE job_id = $1 AND account_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [jobId, session.accountId],
    );

    return NextResponse.json({
      data: {
        lines: lines.rows,
        seeded_at: meta.rows[0]?.materials_plan_seeded_at ?? null,
        seed_estimate_id: meta.rows[0]?.materials_plan_seed_estimate_id ?? null,
      },
    });
  } catch (err) {
    logger.error("GET /api/v1/jobs/[id]/materials", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not load buy list", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});

/** POST — create line, or action=seed / action=reseed */
export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const jobId = jobIdFromUrl(request.url);
  if (!jobId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "create";

  const client = await getPool().connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );
    if (!(await assertJob(client, jobId, session.accountId))) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 },
      );
    }

    if (action === "seed" || action === "reseed") {
      if (session.role === "tech") {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Techs cannot seed buy lists", traceId: session.traceId } },
          { status: 403 },
        );
      }
      const parsed = seedBody.safeParse({ reseed: action === "reseed" || body.reseed === true });
      const result = await seedJobBuyList(client, {
        accountId: session.accountId,
        jobId,
        reseed: parsed.success ? parsed.data.reseed || action === "reseed" : action === "reseed",
      });
      if (!result.ok && result.code === "NO_ESTIMATE") {
        return NextResponse.json(
          { error: { code: "NO_ESTIMATE", message: result.message, traceId: session.traceId }, data: result },
          { status: 422 },
        );
      }
      // NO_LINES still returns 200 with data so UI can show message after timestamp set
      return NextResponse.json({ data: result });
    }

    // create line — tech cannot add
    if (session.role === "tech") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Techs can only update status", traceId: session.traceId } },
        { status: 403 },
      );
    }

    const parsed = createBody.safeParse(body);
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

    const maxSort = await client.query<{ m: string | null }>(
      `SELECT MAX(sort_order)::text AS m FROM job_material_lines WHERE job_id = $1 AND account_id = $2`,
      [jobId, session.accountId],
    );
    const sortOrder = (parseInt(maxSort.rows[0]?.m ?? "-1", 10) || -1) + 1;

    const ins = await client.query(
      `INSERT INTO job_material_lines
         (account_id, job_id, name, quantity, unit_label, store_section, status, source, notes, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'manual',$8,$9)
       RETURNING *`,
      [
        session.accountId,
        jobId,
        parsed.data.name.trim(),
        parsed.data.quantity,
        parsed.data.unit_label ?? null,
        parsed.data.store_section ?? null,
        parsed.data.status,
        parsed.data.notes ?? null,
        sortOrder,
      ],
    );

    return NextResponse.json({ data: ins.rows[0] }, { status: 201 });
  } catch (err) {
    logger.error("POST /api/v1/jobs/[id]/materials", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not update buy list", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});

// silence unused SOURCES for now (source set server-side)
void SOURCES;
