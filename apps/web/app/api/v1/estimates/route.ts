import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import {
  withEstimateContext,
  calcTotals,
  lineItemTotal,
} from "@/lib/estimates/db";
import { estimateStatusSchema } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// === List Estimates (GET /api/v1/estimates) ===

const listQuerySchema = z.object({
  status: estimateStatusSchema.optional(),
  client_id: z.string().uuid().optional(),
  job_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const parseResult = listQuerySchema.safeParse({
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

  const { status, client_id, job_id, page, limit } = parseResult.data;
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = ["e.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

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
        `SELECT COUNT(*) AS total FROM estimates e WHERE ${where}`,
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
    console.error("GET /api/v1/estimates error:", error);
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

const lineItemInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  sort_order: z.number().int().default(0),
});

const createEstimateSchema = z.object({
  client_id: z.string().uuid(),
  job_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  line_items: z.array(lineItemInputSchema).default([]),
});

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

  const {
    client_id,
    job_id,
    property_id,
    notes,
    internal_notes,
    expires_at,
    line_items,
  } = parseResult.data;

  const { subtotal_cents, tax_cents, total_cents } = calcTotals(line_items);

  try {
    const estimate = await withEstimateContext(session, async (client) => {
      // Verify client belongs to account
      const clientRow = await client.query(
        `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
        [client_id, session.accountId]
      );
      if (clientRow.rowCount === 0) {
        throw Object.assign(new Error("Client not found"), { code: "NOT_FOUND" });
      }

      const result = await client.query<{ id: string }>(
        `INSERT INTO estimates
           (account_id, client_id, job_id, property_id, status,
            subtotal_cents, tax_cents, total_cents,
            notes, internal_notes, expires_at, created_by)
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          session.accountId,
          client_id,
          job_id ?? null,
          property_id ?? null,
          subtotal_cents,
          tax_cents,
          total_cents,
          notes ?? null,
          internal_notes ?? null,
          expires_at ?? null,
          session.userId,
        ]
      );
      const estimateId = result.rows[0].id;

      // Insert line items
      for (let i = 0; i < line_items.length; i++) {
        const item = line_items[i];
        const itemTotal = lineItemTotal(item);
        await client.query(
          `INSERT INTO estimate_line_items
             (estimate_id, description, quantity, unit_price_cents, total_cents, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            estimateId,
            item.description,
            item.quantity,
            item.unit_price_cents,
            itemTotal,
            item.sort_order ?? i,
          ]
        );
      }

      // Audit log
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "estimate",
        entity_id: estimateId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { client_id, status: "draft", total_cents },
      });

      return estimateId;
    });

    return NextResponse.json({ id: estimate }, { status: 201 });
  } catch (error) {
    const err = error as Error & { code?: string };
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
    console.error("POST /api/v1/estimates error:", error);
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
