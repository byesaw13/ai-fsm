import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { seedJobBuyList } from "@/lib/jobs/buy-list-seed";

export const dynamic = "force-dynamic";

const STATUSES = ["needed", "purchased", "on_truck", "not_needed"] as const;

const createBody = z.object({
  name: z.string().min(1).max(500),
  quantity: z.number().positive().optional().default(1),
  unit_label: z.string().max(50).nullable().optional(),
  store_section: z.string().max(100).nullable().optional(),
  status: z.enum(STATUSES).optional().default("needed"),
  notes: z.string().max(2000).nullable().optional(),
});

function jobIdFromUrl(url: string): string | null {
  const m = url.match(/\/jobs\/([^/]+)\/materials/);
  return m?.[1] ?? null;
}

async function assertJobAccess(
  client: { query: (q: string, p?: unknown[]) => Promise<{ rowCount: number | null; rows: { id: string }[] }> },
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

/** GET — list buy list lines for job */
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const jobId = jobIdFromUrl(request.url);
  if (!jobId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
      { status: 404 },
    );
  }

  try {
    const result = await withDbSession(session, async (client) => {
      const access = await assertJobAccess(
        client,
        jobId,
        session.accountId,
        session.role,
        session.userId,
      );
      if (access !== "ok") return { access };

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

      return {
        access: "ok" as const,
        data: {
          lines: lines.rows,
          seeded_at: meta.rows[0]?.materials_plan_seeded_at ?? null,
          seed_estimate_id: meta.rows[0]?.materials_plan_seed_estimate_id ?? null,
        },
      };
    });

    if (result.access === "not_found") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (result.access === "forbidden") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Not assigned to this job", traceId: session.traceId } },
        { status: 403 },
      );
    }
    return NextResponse.json({ data: result.data });
  } catch (err) {
    logger.error("GET /api/v1/jobs/[id]/materials", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not load buy list", traceId: session.traceId } },
      { status: 500 },
    );
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

  try {
    return await withDbSession(session, async (client) => {
      const access = await assertJobAccess(
        client,
        jobId,
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

      if (action === "seed" || action === "reseed") {
        if (session.role === "tech") {
          return NextResponse.json(
            { error: { code: "FORBIDDEN", message: "Techs cannot seed buy lists", traceId: session.traceId } },
            { status: 403 },
          );
        }
        const result = await seedJobBuyList(client, {
          accountId: session.accountId,
          jobId,
          reseed: action === "reseed" || body.reseed === true,
        });
        if (!result.ok && result.code === "NO_ESTIMATE") {
          return NextResponse.json(
            {
              error: { code: "NO_ESTIMATE", message: result.message, traceId: session.traceId },
              data: result,
            },
            { status: 422 },
          );
        }
        return NextResponse.json({ data: result });
      }

      if (action === "ai_generate") {
        if (session.role === "tech") {
          return NextResponse.json(
            { error: { code: "FORBIDDEN", message: "Techs cannot generate buy lists", traceId: session.traceId } },
            { status: 403 },
          );
        }

        const jobRes = await client.query<{ title: string; description: string | null }>(
          `SELECT title, description FROM jobs WHERE id = $1 AND account_id = $2`,
          [jobId, session.accountId]
        );
        const job = jobRes.rows[0];
        if (!job) {
          return NextResponse.json(
            { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
            { status: 404 }
          );
        }

        const scopeText = [job.title, job.description].filter(Boolean).join(". ");
        const { generateMaterials } = await import("@/lib/estimates/materials-generator");
        const generated = await generateMaterials({ scope: scopeText, job_type: "general_repair" });

        let insertedCount = 0;
        for (let i = 0; i < generated.items.length; i++) {
          const item = generated.items[i]!;
          await client.query(
            `INSERT INTO job_material_lines
               (account_id, job_id, name, quantity, unit_label, store_section, status, source, notes, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, 'needed', 'ai', $7, $8)`,
            [
              session.accountId,
              jobId,
              item.name,
              item.quantity,
              item.unit,
              item.category || "General",
              item.notes || null,
              i,
            ]
          );
          insertedCount++;
        }

        await client.query(
          `UPDATE jobs SET materials_plan_seeded_at = NOW() WHERE id = $1 AND account_id = $2`,
          [jobId, session.accountId]
        );

        return NextResponse.json({
          data: { mode: "ai_generated", inserted: insertedCount, items: generated.items },
        });
      }

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
    });
  } catch (err) {
    logger.error("POST /api/v1/jobs/[id]/materials", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not update buy list", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
