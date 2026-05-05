import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../lib/auth/middleware";
import { queryOne, getPool } from "../../../../../lib/db";
import { appendAuditLog } from "../../../../../lib/db/audit";
import { logger } from "../../../../../lib/logger";
import { computeCapStatus } from "../../../../../lib/visits/membership-cap";
import { MEMBERSHIP_VISIT_PHASES } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const membershipVisitPhaseSchema = z.enum(
  MEMBERSHIP_VISIT_PHASES as unknown as [string, ...string[]]
);

// Owner/admin can update all mutable fields
const ownerUpdateBody = z.object({
  assigned_user_id: z.string().uuid().nullable().optional(),
  scheduled_start: z.string().datetime().optional(),
  scheduled_end: z.string().datetime().optional(),
  tech_notes: z.string().nullable().optional(),
  materials_used: z.string().nullable().optional(),
  issue_description: z.string().nullable().optional(),
  membership_visit_phase: membershipVisitPhaseSchema.optional(),
  included_labor_minutes_used: z.number().int().nonnegative().optional(),
});

// Tech can update notes, materials, issue description, and membership visit fields
const techUpdateBody = z.object({
  tech_notes: z.string().nullable().optional(),
  materials_used: z.string().nullable().optional(),
  issue_description: z.string().nullable().optional(),
  membership_visit_phase: membershipVisitPhaseSchema.optional(),
  included_labor_minutes_used: z.number().int().nonnegative().optional(),
});

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    // Extract [id] from URL — HOF wrappers don't forward route params
    const id = request.url.match(/\/visits\/([^/]+)/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const visit = await queryOne(
      `SELECT * FROM visits WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );

    if (!visit) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: visit });
  }
);

export const PATCH = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/visits\/([^/]+)/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);

    // Scope allowed fields by role — tech may only update tech_notes
    const schema = session.role === "tech" ? techUpdateBody : ownerUpdateBody;
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parsed.error.flatten().fieldErrors,
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      const existing = await client.query(
        `SELECT * FROM visits WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );

      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      const old = existing.rows[0];
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 3;

      for (const [key, val] of Object.entries(parsed.data)) {
        if (val !== undefined) {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }

      // Auto-compute membership_cap_status when labor minutes are updated
      if (parsed.data.included_labor_minutes_used !== undefined) {
        const capMinutes = old.included_labor_cap_minutes as number | null;
        const capStatus = computeCapStatus(parsed.data.included_labor_minutes_used, capMinutes);
        fields.push(`membership_cap_status = $${idx++}`);
        values.push(capStatus);
      }

      if (fields.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ data: old });
      }

      const { rows } = await client.query(
        `UPDATE visits SET ${fields.join(", ")}, updated_at = now() WHERE id = $1 AND account_id = $2 RETURNING *`,
        [id, session.accountId, ...values]
      );

      const updated = rows[0];

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "visit",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: old,
        new_value: updated,
      });

      await client.query("COMMIT");
      return NextResponse.json({ data: updated });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[visits PATCH]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to update visit", traceId: session.traceId } },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);

export const DELETE = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    if (!["owner", "admin"].includes(session.role)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Owner or admin role required to delete visits", traceId: session.traceId } },
        { status: 403 }
      );
    }

    const id = request.url.match(/\/visits\/([^/]+)/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      const existing = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM visits WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );

      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      const visit = existing.rows[0];
      if (["completed", "cancelled"].includes(visit.status)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "IMMUTABLE_ENTITY",
              message: `Cannot delete a visit in "${visit.status}" state.`,
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      await client.query(`DELETE FROM visits WHERE id = $1`, [id]);

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "visit",
        entity_id: id,
        action: "delete",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: visit.status },
      });

      await client.query("COMMIT");
      return NextResponse.json({ deleted: true });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[visits DELETE]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to delete visit", traceId: session.traceId } },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
