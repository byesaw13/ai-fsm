import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool, queryForSession } from "@/lib/db";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";
import { WORK_ORDER_STATUSES } from "../route";
import type { CompletionCriterion } from "@ai-fsm/domain";
import {
  enforceDraftOnlyFromAssessment,
  validateWorkOrderCompletion,
  validateWorkOrderForeignKeys,
} from "@/lib/work-orders/validate";

export const dynamic = "force-dynamic";

function idFromPath(request: NextRequest): string | undefined {
  return request.nextUrl.pathname.split("/").at(-1);
}
function err(code: string, message: string, status: number, traceId: string) {
  return NextResponse.json({ error: { code, message, traceId } }, { status });
}

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

// All fields optional — only what's sent is updated. materials, when present,
// replaces the set.
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  scope: z.string().max(5000).nullable().optional(),
  site_notes: z.string().max(2000).nullable().optional(),
  safety_notes: z.string().max(2000).nullable().optional(),
  rooms: z.array(roomSchema).optional(),
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  notes: z.string().max(2000).nullable().optional(),
  job_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  materials: z.array(materialSchema).optional(),
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
});

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!canCreateEstimates(session.role)) return err("FORBIDDEN", "Not permitted", 403, session.traceId);
  const id = idFromPath(request);
  if (!id) return err("NOT_FOUND", "Work order not found", 404, session.traceId);
  try {
    const rows = await queryForSession<Record<string, unknown>>(
      session,
      `SELECT w.*, c.name AS client_name, p.address AS property_address, j.title AS job_title
       FROM work_orders w
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN properties p ON p.id = w.property_id
       LEFT JOIN jobs j ON j.id = w.job_id
       WHERE w.id = $1 AND w.account_id = $2`,
      [id, session.accountId],
    );
    const wo = rows[0];
    if (!wo) return err("NOT_FOUND", "Work order not found", 404, session.traceId);
    const materials = await queryForSession<Record<string, unknown>>(
      session,
      `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
       FROM work_order_materials WHERE work_order_id = $1 ORDER BY sort_order ASC`,
      [id],
    );
    return NextResponse.json({ data: { work_order: wo, materials } });
  } catch (error) {
    logger.error("GET /api/v1/work-orders/[id] error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to load work order", 500, session.traceId);
  }
});

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!canCreateEstimates(session.role)) return err("FORBIDDEN", "Not permitted", 403, session.traceId);
  const id = idFromPath(request);
  if (!id) return err("NOT_FOUND", "Work order not found", 404, session.traceId);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err("VALIDATION_ERROR", "Invalid request", 400, session.traceId);
  const d = parsed.data;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );

    const { rows: existing } = await client.query<{
      id: string;
      client_id: string;
      job_id: string | null;
      source_visit_id: string | null;
      source_assessment_id: string | null;
      status: string;
      completion_criteria: unknown;
    }>(
      `SELECT id, client_id, job_id, source_visit_id, source_assessment_id, status,
              completion_criteria
       FROM work_orders WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [id, session.accountId],
    );
    if (existing.length === 0) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Work order not found", 404, session.traceId);
    }
    const wo = existing[0];

    const nextJobId = d.job_id !== undefined ? d.job_id : wo.job_id;
    const nextStatus = d.status ?? wo.status;
    const draftErr = enforceDraftOnlyFromAssessment({
      status: nextStatus,
      job_id: nextJobId,
      source_visit_id: wo.source_visit_id,
      source_assessment_id: wo.source_assessment_id,
    });
    if (draftErr) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", draftErr, 400, session.traceId);
    }

    if (d.job_id !== undefined || d.property_id !== undefined) {
      const fkErr = await validateWorkOrderForeignKeys(client, session.accountId, {
        client_id: wo.client_id,
        job_id: nextJobId,
        property_id: d.property_id,
      });
      if (fkErr) {
        await client.query("ROLLBACK");
        return err("VALIDATION_ERROR", fkErr, 400, session.traceId);
      }
    }

    if (nextStatus === "completed" && wo.status !== "completed") {
      const criteria: CompletionCriterion[] = d.completion_criteria
        ?? (Array.isArray(wo.completion_criteria)
          ? (wo.completion_criteria as CompletionCriterion[])
          : []);
      const completionErr = await validateWorkOrderCompletion(
        client,
        id,
        session.accountId,
        criteria,
      );
      if (completionErr) {
        await client.query("ROLLBACK");
        return err("VALIDATION_ERROR", completionErr, 422, session.traceId);
      }
    }

    // Scalar fields — COALESCE keeps unset fields; status='completed' stamps
    // completed_at (and clears it when moved out of completed).
    await client.query(
      `UPDATE work_orders SET
         title        = COALESCE($3, title),
         scope        = CASE WHEN $4 THEN $5 ELSE scope END,
         site_notes   = CASE WHEN $6 THEN $7 ELSE site_notes END,
         safety_notes = CASE WHEN $8 THEN $9 ELSE safety_notes END,
         rooms        = CASE WHEN $10 THEN $11::jsonb ELSE rooms END,
         status       = COALESCE($12, status),
         notes        = CASE WHEN $13 THEN $14 ELSE notes END,
         job_id       = CASE WHEN $15 THEN $16 ELSE job_id END,
         property_id  = CASE WHEN $17 THEN $18 ELSE property_id END,
         completion_criteria = CASE WHEN $19 THEN $20::jsonb ELSE completion_criteria END,
         completed_at = CASE WHEN $12 = 'completed' THEN COALESCE(completed_at, now())
                             WHEN $12 IS NOT NULL THEN NULL
                             ELSE completed_at END,
         updated_at   = now()
       WHERE id = $1 AND account_id = $2`,
      [
        id, session.accountId,
        d.title ?? null,
        d.scope !== undefined, d.scope ?? null,
        d.site_notes !== undefined, d.site_notes ?? null,
        d.safety_notes !== undefined, d.safety_notes ?? null,
        d.rooms !== undefined, d.rooms ? JSON.stringify(d.rooms) : null,
        d.status ?? null,
        d.notes !== undefined, d.notes ?? null,
        d.job_id !== undefined, d.job_id ?? null,
        d.property_id !== undefined, d.property_id ?? null,
        d.completion_criteria !== undefined,
        d.completion_criteria ? JSON.stringify(d.completion_criteria) : null,
      ],
    );

    // Materials, when provided, replace the set and recompute total.
    if (d.materials !== undefined) {
      const materials = d.materials.filter((m) => m.description.trim().length > 0);
      await client.query(`DELETE FROM work_order_materials WHERE work_order_id = $1`, [id]);
      for (let i = 0; i < materials.length; i++) {
        const m = materials[i];
        await client.query(
          `INSERT INTO work_order_materials (work_order_id, description, quantity, unit_price_cents, total_cents, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, m.description, m.quantity, m.unit_price_cents, m.total_cents, i],
        );
      }
      const total = materials.reduce((s, m) => s + m.total_cents, 0);
      await client.query(`UPDATE work_orders SET total_cents = $2 WHERE id = $1`, [id, total]);
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { id } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PATCH /api/v1/work-orders/[id] error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to update work order", 500, session.traceId);
  } finally {
    client.release();
  }
});
