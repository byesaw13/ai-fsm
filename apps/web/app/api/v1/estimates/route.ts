import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withEstimateContext } from "@/lib/estimates/db";
import { estimateStatusSchema } from "@ai-fsm/domain";
import { logger } from "@/lib/logger";
import { createEstimate, createEstimateSchema } from "@/lib/estimates/create-estimate";

export const dynamic = "force-dynamic";

// === List Estimates (GET /api/v1/estimates) ===

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: estimateStatusSchema.optional(),
  client_id: z.string().uuid().optional(),
  job_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const parseResult = listQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    client_id: searchParams.get("client_id") ?? undefined,
    job_id: searchParams.get("job_id") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { q, status, client_id, job_id, page, limit } = parseResult.data;
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = ["e.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

    if (q) {
      const pattern = `%${q.toLowerCase()}%`;
      conditions.push(
        `(LOWER(c.name) LIKE $${idx} OR LOWER(COALESCE(e.notes, '')) LIKE $${idx})`
      );
      params.push(pattern);
      idx++;
    }
    if (status) {
      conditions.push(`e.status = $${idx++}`);
      params.push(status);
    }
    if (client_id) {
      conditions.push(`e.client_id = $${idx++}`);
      params.push(client_id);
    }
    if (job_id) {
      conditions.push(`e.job_id = $${idx++}`);
      params.push(job_id);
    }

    const where = conditions.join(" AND ");

    const countParams = [...params];
    const countResult = await withEstimateContext(session, async (client) => {
      const r = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM estimates e
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE ${where}`,
        countParams
      );
      return r.rows[0]?.total ?? "0";
    });
    const total = parseInt(countResult, 10);

    params.push(limit, offset);
    const rows = await withEstimateContext(session, async (client) => {
      const r = await client.query(
        `SELECT e.id, e.status, e.subtotal_cents, e.tax_cents, e.total_cents,
                e.notes, e.internal_notes, e.sent_at, e.expires_at,
                e.client_id, e.job_id, e.property_id,
                e.created_by, e.created_at, e.updated_at,
                c.name AS client_name
         FROM estimates e
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE ${where}
         ORDER BY e.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      );
      return r.rows;
    });

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total },
    });
  } catch (error) {
    logger.error("GET /api/v1/estimates error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch estimates",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === Create Estimate (POST /api/v1/estimates) ===

export const POST = withRole(["owner", "admin"], async (request, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON body",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const parseResult = createEstimateSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    const { id, engineResult } = await createEstimate(session, parseResult.data);
    return NextResponse.json({
      id,
      ...(engineResult ? { engineResult } : {}),
    }, { status: 201 });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "VALIDATION_ERROR") {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 400 }
      );
    }
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Client not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }
    logger.error("POST /api/v1/estimates error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create estimate",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
