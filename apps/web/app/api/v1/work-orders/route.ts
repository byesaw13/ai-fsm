import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WORK_ORDER_STATUSES } from "@/lib/work-orders/constants";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool, queryForSession } from "@/lib/db";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";
import {
  enforceDraftOnlyFromAssessment,
  validateWorkOrderForeignKeys,
} from "@/lib/work-orders/validate";

export const dynamic = "force-dynamic";

// EPIC-002 / TASK-018 slice 3: work orders. Owner/admin only.

const materialSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  total_cents: z.number().int().nonnegative(),
});

const roomSchema = z.object({
  name: z.string().max(120),
  dimensions: z.string().max(120).nullable().optional(),
  description: z.string().max(1000),
});

const createSchema = z.object({
  client_id: z.string().uuid(),
  job_id: z.string().uuid().nullish(),
  property_id: z.string().uuid().nullish(),
  title: z.string().min(1).max(200),
  scope: z.string().max(5000).nullish(),
  site_notes: z.string().max(2000).nullish(),
  safety_notes: z.string().max(2000).nullish(),
  rooms: z.array(roomSchema).default([]),
  status: z.enum(WORK_ORDER_STATUSES).default("draft"),
  notes: z.string().max(2000).nullish(),
  materials: z.array(materialSchema).default([]),
  completion_criteria: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().min(1),
        required: z.boolean(),
        completed: z.boolean(),
      }),
    )
    .optional(),
  source_visit_id: z.string().uuid().nullish(),
  source_assessment_id: z.string().uuid().nullish(),
});

type ListRow = {
  id: string;
  title: string;
  status: string;
  total_cents: number;
  client_id: string | null;
  client_name: string | null;
  property_address: string | null;
  completed_at: string | null;
  created_at: string;
};

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!canCreateEstimates(session.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not permitted", traceId: session.traceId } }, { status: 403 });
  }
  try {
    const status = request.nextUrl.searchParams.get("status");
    const rows = await queryForSession<ListRow>(
      session,
      `SELECT w.id, w.title, w.status, w.total_cents, w.client_id,
              c.name AS client_name, p.address AS property_address,
              w.completed_at::text, w.created_at::text
       FROM work_orders w
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN properties p ON p.id = w.property_id
       WHERE w.account_id = $1
         AND ($2::text IS NULL OR w.status = $2)
       ORDER BY w.created_at DESC
       LIMIT 200`,
      [session.accountId, status && (WORK_ORDER_STATUSES as readonly string[]).includes(status) ? status : null],
    );
    return NextResponse.json({ data: { work_orders: rows } });
  } catch (error) {
    logger.error("GET /api/v1/work-orders error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to load work orders", traceId: session.traceId } }, { status: 500 });
  }
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!canCreateEstimates(session.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not permitted", traceId: session.traceId } }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", traceId: session.traceId, details: parsed.error.flatten().fieldErrors } },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const status = !d.job_id ? "draft" : d.status;
  const draftErr = enforceDraftOnlyFromAssessment({
    status,
    job_id: d.job_id,
    source_visit_id: d.source_visit_id,
    source_assessment_id: d.source_assessment_id,
  });
  if (draftErr) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: draftErr, traceId: session.traceId } },
      { status: 400 },
    );
  }

  const materials = d.materials.filter((m) => m.description.trim().length > 0);
  const totalCents = materials.reduce((sum, m) => sum + m.total_cents, 0);

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );

    const fkErr = await validateWorkOrderForeignKeys(client, session.accountId, {
      client_id: d.client_id,
      job_id: d.job_id,
      property_id: d.property_id,
      source_visit_id: d.source_visit_id,
      source_assessment_id: d.source_assessment_id,
    });
    if (fkErr) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: fkErr, traceId: session.traceId } },
        { status: 400 },
      );
    }

    const { rows: woRows } = await client.query<{ id: string }>(
      `INSERT INTO work_orders
         (account_id, client_id, job_id, property_id, title, scope, site_notes,
          safety_notes, rooms, status, total_cents, notes, completion_criteria,
          source_visit_id, source_assessment_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13::jsonb,$14,$15,$16)
       RETURNING id`,
      [
        session.accountId, d.client_id, d.job_id ?? null, d.property_id ?? null,
        d.title, d.scope ?? null, d.site_notes ?? null, d.safety_notes ?? null,
        JSON.stringify(d.rooms), status, totalCents, d.notes ?? null,
        JSON.stringify(d.completion_criteria ?? []),
        d.source_visit_id ?? null, d.source_assessment_id ?? null, session.userId,
      ],
    );
    const workOrderId = woRows[0].id;

    for (let i = 0; i < materials.length; i++) {
      const m = materials[i];
      await client.query(
        `INSERT INTO work_order_materials
           (work_order_id, description, quantity, unit_price_cents, total_cents, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [workOrderId, m.description, m.quantity, m.unit_price_cents, m.total_cents, i],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { id: workOrderId } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/v1/work-orders error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to create work order", traceId: session.traceId } }, { status: 500 });
  } finally {
    client.release();
  }
});
