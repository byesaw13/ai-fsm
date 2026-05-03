import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import {
  withEstimateContext,
  calcTotals,
  lineItemTotal,
} from "@/lib/estimates/db";
import { calculatePaintingEstimate } from "@/lib/estimates/pricing";
import { DEPOSIT_RATE } from "@ai-fsm/domain";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// === Get Estimate (GET /api/v1/estimates/[id]) ===

export const GET = withAuth(async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-1)!;

  try {
    const data = await withEstimateContext(session, async (client) => {
      const estimateResult = await client.query(
        `SELECT e.id, e.status, e.subtotal_cents, e.tax_cents, e.total_cents,
                e.notes, e.internal_notes, e.sent_at, e.expires_at,
                e.client_id, e.job_id, e.property_id,
                e.created_by, e.created_at, e.updated_at,
                c.name AS client_name
         FROM estimates e
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE e.id = $1 AND e.account_id = $2`,
        [id, session.accountId]
      );

      if (estimateResult.rowCount === 0) return null;

      const lineItemsResult = await client.query(
        `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order, created_at
         FROM estimate_line_items
         WHERE estimate_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [id]
      );

      return {
        ...estimateResult.rows[0],
        line_items: lineItemsResult.rows,
      };
    });

    if (!data) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Estimate not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("GET /api/v1/estimates/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch estimate",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === Update Estimate (PATCH /api/v1/estimates/[id]) ===

const lineItemInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  sort_order: z.number().int().default(0),
});

const patchEstimateSchema = z.object({
  client_id: z.string().uuid().optional(),
  job_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  line_items: z.array(lineItemInputSchema).optional(),
  // Flat-rate mode: set this instead of line_items
  flat_rate_cents: z.number().int().nonnegative().optional(),
  // Painting engine fields
  sq_ft: z.number().positive().optional(),
  prep_level: z.number().int().min(1).max(10).optional(),
  includes_trim: z.boolean().optional(),
  includes_ceiling: z.boolean().optional(),
  material_cost_cents: z.number().int().nonnegative().optional(),
  labor_hours_estimate: z.number().positive().optional(),
});

export const PATCH = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-1)!;

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

  const parseResult = patchEstimateSchema.safeParse(body);
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

  const patch = parseResult.data;

  try {
    const result = await withEstimateContext(session, async (client) => {
      const existing = await client.query<{
        id: string;
        status: string;
        subtotal_cents: number;
        tax_cents: number;
        total_cents: number;
      }>(
        `SELECT id, status, subtotal_cents, tax_cents, total_cents
         FROM estimates WHERE id = $1 AND account_id = $2`,
        [id, session.accountId]
      );

      if (existing.rowCount === 0) {
        throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
      }

      const est = existing.rows[0];

      // Terminal states are fully immutable
      if (["approved", "declined", "expired"].includes(est.status)) {
        throw Object.assign(
          new Error(`Estimate in ${est.status} state is immutable`),
          { code: "IMMUTABLE_ENTITY" }
        );
      }

      // In sent state: only internal_notes may change
      if (est.status === "sent") {
        const disallowedKeys = [
          "client_id",
          "job_id",
          "property_id",
          "notes",
          "expires_at",
          "line_items",
          "flat_rate_cents",
          "sq_ft",
          "prep_level",
          "includes_trim",
          "includes_ceiling",
          "material_cost_cents",
          "labor_hours_estimate",
        ] as const;
        for (const key of disallowedKeys) {
          if (patch[key] !== undefined) {
            throw Object.assign(
              new Error(
                "Estimate in sent state: only internal_notes may be updated"
              ),
              { code: "IMMUTABLE_ENTITY" }
            );
          }
        }

        // Only update internal_notes
        if (patch.internal_notes !== undefined) {
          await client.query(
            `UPDATE estimates SET internal_notes = $1, updated_at = now()
             WHERE id = $2`,
            [patch.internal_notes, id]
          );
          await appendAuditLog(client, {
            account_id: session.accountId,
            entity_type: "estimate",
            entity_id: id,
            action: "update",
            actor_id: session.userId,
            trace_id: session.traceId,
            old_value: { internal_notes: null },
            new_value: { internal_notes: patch.internal_notes },
          });
        }

        return { updated: true };
      }

      // Draft state: full update
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (patch.client_id !== undefined) {
        setClauses.push(`client_id = $${idx++}`);
        params.push(patch.client_id);
      }
      if (patch.job_id !== undefined) {
        setClauses.push(`job_id = $${idx++}`);
        params.push(patch.job_id);
      }
      if (patch.property_id !== undefined) {
        setClauses.push(`property_id = $${idx++}`);
        params.push(patch.property_id);
      }
      if (patch.notes !== undefined) {
        setClauses.push(`notes = $${idx++}`);
        params.push(patch.notes);
      }
      if (patch.internal_notes !== undefined) {
        setClauses.push(`internal_notes = $${idx++}`);
        params.push(patch.internal_notes);
      }
      if (patch.expires_at !== undefined) {
        setClauses.push(`expires_at = $${idx++}`);
        params.push(patch.expires_at);
      }
      if (patch.sq_ft !== undefined) {
        setClauses.push(`sq_ft = $${idx++}`);
        params.push(patch.sq_ft);
      }
      if (patch.prep_level !== undefined) {
        setClauses.push(`prep_level = $${idx++}`);
        params.push(patch.prep_level);
      }
      if (patch.includes_trim !== undefined) {
        setClauses.push(`includes_trim = $${idx++}`);
        params.push(patch.includes_trim);
      }
      if (patch.includes_ceiling !== undefined) {
        setClauses.push(`includes_ceiling = $${idx++}`);
        params.push(patch.includes_ceiling);
      }

      // Replace totals + line items if pricing fields are provided
      const has_painting_fields =
        patch.sq_ft !== undefined &&
        patch.prep_level !== undefined &&
        patch.labor_hours_estimate !== undefined;

      if (patch.line_items !== undefined || patch.flat_rate_cents !== undefined || has_painting_fields) {
        let subtotal_cents: number;
        let itemsToInsert = patch.line_items ?? [];
        let new_internal_labor: number | null = null;
        let new_internal_material: number | null = null;

        if (has_painting_fields) {
          const result = calculatePaintingEstimate({
            sq_ft: patch.sq_ft!,
            prep_level: patch.prep_level!,
            includes_trim: patch.includes_trim ?? false,
            includes_ceiling: patch.includes_ceiling ?? false,
            material_cost_cents: patch.material_cost_cents ?? 0,
            labor_hours_estimate: patch.labor_hours_estimate!,
          });
          subtotal_cents = result.total_cents;
          new_internal_labor = result.internal_labor_cost_cents;
          new_internal_material = patch.material_cost_cents ?? null;
        } else {
          subtotal_cents =
            patch.flat_rate_cents !== undefined
              ? patch.flat_rate_cents
              : calcTotals(patch.line_items!).subtotal_cents;
          itemsToInsert = patch.flat_rate_cents !== undefined ? [] : patch.line_items!;
        }

        const taxRate = patch.tax_rate ?? 0;
        const tax_cents = Math.round((subtotal_cents * taxRate) / 100);
        const total_cents = subtotal_cents + tax_cents;
        const deposit_cents = Math.round(total_cents * DEPOSIT_RATE);
        const balance_cents = total_cents - deposit_cents;
        setClauses.push(`subtotal_cents = $${idx++}`);
        params.push(subtotal_cents);
        setClauses.push(`tax_cents = $${idx++}`);
        params.push(tax_cents);
        setClauses.push(`total_cents = $${idx++}`);
        params.push(total_cents);
        setClauses.push(`deposit_cents = $${idx++}`);
        params.push(deposit_cents);
        setClauses.push(`balance_cents = $${idx++}`);
        params.push(balance_cents);

        if (new_internal_labor !== null) {
          setClauses.push(`internal_labor_cost_cents = $${idx++}`);
          params.push(new_internal_labor);
        }
        if (new_internal_material !== null) {
          setClauses.push(`internal_material_cost_cents = $${idx++}`);
          params.push(new_internal_material);
        }

        // Delete existing line items
        await client.query(
          `DELETE FROM estimate_line_items WHERE estimate_id = $1`,
          [id]
        );

        // Insert new line items (skipped in flat-rate mode)
        for (let i = 0; i < itemsToInsert.length; i++) {
          const item = itemsToInsert[i];
          await client.query(
            `INSERT INTO estimate_line_items
               (estimate_id, description, quantity, unit_price_cents, total_cents, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              item.description,
              item.quantity,
              item.unit_price_cents,
              lineItemTotal(item),
              item.sort_order ?? i,
            ]
          );
        }
      }

      if (setClauses.length > 0) {
        setClauses.push(`updated_at = now()`);
        params.push(id);
        await client.query(
          `UPDATE estimates SET ${setClauses.join(", ")} WHERE id = $${idx}`,
          params
        );
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "estimate",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: est.status, total_cents: est.total_cents },
        new_value: patch,
      });

      return { updated: true };
    });

    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Estimate not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }
    if (err.code === "IMMUTABLE_ENTITY") {
      return NextResponse.json(
        {
          error: {
            code: "IMMUTABLE_ENTITY",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }
    logger.error("PATCH /api/v1/estimates/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update estimate",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === Delete Estimate (DELETE /api/v1/estimates/[id]) ===

export const DELETE = withRole(["owner"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-1)!;

  try {
    await withEstimateContext(session, async (client) => {
      const existing = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM estimates WHERE id = $1 AND account_id = $2`,
        [id, session.accountId]
      );

      if (existing.rowCount === 0) {
        throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
      }

      const est = existing.rows[0];
      if (est.status !== "draft") {
        throw Object.assign(
          new Error("Only draft estimates may be deleted"),
          { code: "IMMUTABLE_ENTITY" }
        );
      }

      // Line items cascade via FK
      await client.query(
        `DELETE FROM estimates WHERE id = $1`,
        [id]
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "estimate",
        entity_id: id,
        action: "delete",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: est.status },
      });
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Estimate not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }
    if (err.code === "IMMUTABLE_ENTITY") {
      return NextResponse.json(
        {
          error: {
            code: "IMMUTABLE_ENTITY",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }
    logger.error("DELETE /api/v1/estimates/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete estimate",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
