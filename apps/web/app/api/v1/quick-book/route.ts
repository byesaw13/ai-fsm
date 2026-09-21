/**
 * POST /api/v1/quick-book
 * Creates a client (optional), job, and visit in a single transaction.
 * Designed for the calendar's "quick book" flow where no estimate is needed.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { syncWorkOrderLeadFromVisit } from "@/lib/work-orders/assign-lead";
import { createDefaultWorkOrderForJob } from "@/lib/work-orders/create-default";
import { syncWorkOrderStatus } from "@/lib/work-orders/sync-status";
import {
  QUICK_JOB_PRICING_MODE,
  resolveQuickBookAssignee,
  resolveQuickBookHouse,
} from "@/lib/jobs/quick-book";

export const dynamic = "force-dynamic";

const JOB_TYPES = [
  "repair", "maintenance", "carpentry", "painting", "plumbing",
  "electrical", "hvac", "roofing", "flooring", "windows_doors",
  "appliances", "drywall", "landscaping", "custom",
] as const;

const bodySchema = z.object({
  // Client — provide exactly one of these
  client_id: z.string().uuid().optional(),
  client_name: z.string().min(1).max(255).optional(),
  // Job
  job_title: z.string().min(1).max(255),
  job_type: z.enum(JOB_TYPES).default("repair"),
  notes: z.string().max(5000).optional(),
  // Visit
  scheduled_start: z.string().datetime(),
  scheduled_end: z.string().datetime(),
  assigned_user_id: z.string().uuid().optional(),
  /** My Day / FAB: assign the booker. Schedule Unassigned omits this. */
  assign_self: z.boolean().optional(),
  /** House — existing pin or a typed address. Required. */
  property_id: z.string().uuid().optional(),
  address: z.string().min(1).max(500).optional(),
}).refine(d => d.client_id || d.client_name, {
  message: "Provide either client_id (existing) or client_name (new)",
}).refine(d => resolveQuickBookHouse({ property_id: d.property_id, address: d.address }), {
  message: "Provide a house: property_id or address",
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  let body: unknown = {};
  try { body = await request.json(); } catch { /* ok */ }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid body", details: parsed.error.issues, traceId: session.traceId } },
      { status: 422 }
    );
  }

  const d = parsed.data;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    // ── 1. Resolve or create client ──────────────────────────────────────────
    let clientId: string;

    if (d.client_id) {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
        [d.client_id, session.accountId]
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Client not found", traceId: session.traceId } },
          { status: 404 }
        );
      }
      clientId = rows[0].id;
    } else {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO clients (account_id, name)
         VALUES ($1, $2)
         RETURNING id`,
        [session.accountId, d.client_name!]
      );
      clientId = rows[0].id;
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "client",
        entity_id: clientId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { name: d.client_name },
      });
    }

    // ── 2. House (required) ──────────────────────────────────────────────────
    const house = resolveQuickBookHouse({
      property_id: d.property_id,
      address: d.address,
    });
    if (!house) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Provide a house: property_id or address", traceId: session.traceId } },
        { status: 422 },
      );
    }

    let propertyId: string;
    if (house.kind === "existing") {
      const { rows } = await client.query<{ id: string; client_id: string }>(
        `SELECT id, client_id FROM properties WHERE id = $1 AND account_id = $2`,
        [house.propertyId, session.accountId],
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "House not found", traceId: session.traceId } },
          { status: 404 },
        );
      }
      if (rows[0].client_id !== clientId) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "House does not belong to this client", traceId: session.traceId } },
          { status: 422 },
        );
      }
      propertyId = rows[0].id;
    } else {
      const { rows: existing } = await client.query<{ id: string }>(
        `SELECT id FROM properties
         WHERE account_id = $1 AND client_id = $2 AND lower(address) = lower($3)
         LIMIT 1`,
        [session.accountId, clientId, house.address],
      );
      if (existing[0]) {
        propertyId = existing[0].id;
      } else {
        const { rows: created } = await client.query<{ id: string }>(
          `INSERT INTO properties (account_id, client_id, name, address)
           VALUES ($1, $2, $3, $3)
           RETURNING id`,
          [session.accountId, clientId, house.address],
        );
        propertyId = created[0].id;
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "property",
          entity_id: propertyId,
          action: "insert",
          actor_id: session.userId,
          trace_id: session.traceId,
          new_value: { address: house.address, client_id: clientId },
        });
      }
    }

    // ── 3. Create job (T&M) ──────────────────────────────────────────────────
    const { rows: jobRows } = await client.query<{ id: string }>(
      `INSERT INTO jobs (account_id, client_id, property_id, title, job_type, description, pricing_mode, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        session.accountId,
        clientId,
        propertyId,
        d.job_title,
        d.job_type,
        d.notes ?? null,
        QUICK_JOB_PRICING_MODE,
        session.userId,
      ],
    );
    const jobId = jobRows[0].id;
    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "job",
      entity_id: jobId,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: {
        title: d.job_title,
        job_type: d.job_type,
        client_id: clientId,
        property_id: propertyId,
        pricing_mode: QUICK_JOB_PRICING_MODE,
      },
    });

    // ── 4. Default work order (standard visits require work_order_id post-migration 137)
    const workOrderId = await createDefaultWorkOrderForJob({
      client,
      accountId: session.accountId,
      clientId,
      jobId,
      title: d.job_title,
      scope: d.notes ?? null,
      createdBy: session.userId,
    });

    const assignedUserId = resolveQuickBookAssignee(
      d.assigned_user_id,
      session.userId,
      d.assign_self === true,
    );

    // ── 5. Create visit ──────────────────────────────────────────────────────
    const { rows: visitRows } = await client.query(
      `INSERT INTO visits (account_id, job_id, work_order_id, assigned_user_id, scheduled_start, scheduled_end, visit_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'standard')
       RETURNING *`,
      [
        session.accountId,
        jobId,
        workOrderId,
        assignedUserId,
        d.scheduled_start,
        d.scheduled_end,
      ],
    );
    const visit = visitRows[0];
    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "visit",
      entity_id: visit.id,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: visit,
    });

    await syncWorkOrderLeadFromVisit(
      client,
      workOrderId,
      session.accountId,
      assignedUserId,
    );
    await syncWorkOrderStatus(client, workOrderId, session.accountId);

    // ── 6. Advance job to 'scheduled' ────────────────────────────────────────
    await client.query(
      `UPDATE jobs SET status = 'scheduled', updated_at = now() WHERE id = $1 AND account_id = $2`,
      [jobId, session.accountId]
    );
    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "job",
      entity_id: jobId,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: { status: "draft" },
      new_value: { status: "scheduled" },
    });

    await client.query("COMMIT");
    return NextResponse.json(
      { data: { job_id: jobId, visit_id: visit.id, client_id: clientId, property_id: propertyId, work_order_id: workOrderId } },
      { status: 201 },
    );
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/quick-book error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create booking", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
