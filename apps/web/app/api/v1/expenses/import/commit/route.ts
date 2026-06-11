import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const EXPENSE_CATEGORIES = [
  "materials", "tools", "fuel", "vehicle", "subcontractors",
  "office", "insurance", "utilities", "marketing", "meals", "travel", "other",
] as const;
const MATERIAL_CATEGORIES = [
  "paint", "lumber", "hardware", "concrete", "fasteners",
  "sheet_goods", "trim", "flooring", "other",
] as const;

const lineItemSchema = z.object({
  sku: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
  category: z.enum(MATERIAL_CATEGORIES).default("other"),
  unit_cost_cents: z.number().int(),
  quantity: z.number().default(1),
});

const txnSchema = z.object({
  external_ref: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendor: z.string().min(1).max(200),
  amount_cents: z.number().int().positive(),
  expense_category: z.enum(EXPENSE_CATEGORIES).default("materials"),
  job_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  line_items: z.array(lineItemSchema).default([]),
});

const bodySchema = z.object({
  source: z.string().default("home_depot_csv"),
  transactions: z.array(txnSchema).min(1).max(2000),
  update_prices: z.boolean().default(true),
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid import payload", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 }
    );
  }
  const { source, transactions, update_prices } = parsed.data;

  try {
    const result = await withExpenseContext(session, async (client) => {
      let created = 0;
      let skipped = 0;
      let materials = 0;

      for (const t of transactions) {
        const notes = t.notes ?? (t.line_items.length ? `${t.line_items.length} item(s) · imported from Home Depot` : "Imported from Home Depot");
        const ins = await client.query<{ id: string }>(
          `INSERT INTO expenses
             (account_id, job_id, client_id, vendor_name, category, amount_cents,
              expense_date, notes, source, external_ref, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)
           ON CONFLICT (account_id, source, external_ref)
             WHERE source IS NOT NULL AND external_ref IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [
            session.accountId, t.job_id ?? null, t.client_id ?? null, t.vendor,
            t.expense_category, t.amount_cents, t.date, notes, source, t.external_ref, session.userId,
          ]
        );
        if (ins.rows[0]) created++; else { skipped++; continue; }

        if (update_prices) {
          for (const li of t.line_items) {
            if (li.unit_cost_cents <= 0) continue; // skip returns / $0 lines in the price book
            await client.query(
              `INSERT INTO materials_price_book
                 (account_id, name, category, unit, unit_cost_cents, supplier, sku, last_purchased_at, created_by)
               VALUES ($1, $2, $3, 'each', $4, $5, $6, $7::date, $8)
               ON CONFLICT (account_id, lower(name), unit) DO UPDATE SET
                 unit_cost_cents   = EXCLUDED.unit_cost_cents,
                 supplier          = COALESCE(EXCLUDED.supplier, materials_price_book.supplier),
                 sku               = COALESCE(EXCLUDED.sku, materials_price_book.sku),
                 last_purchased_at = GREATEST(materials_price_book.last_purchased_at, EXCLUDED.last_purchased_at),
                 updated_at        = now()`,
              [session.accountId, li.name, li.category, li.unit_cost_cents, t.vendor, li.sku ?? null, t.date, session.userId]
            );
            materials++;
          }
        }
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense_import",
        entity_id: randomUUID(), // batch id — audit_log.entity_id is a uuid
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { source, created, skipped, materials_upserted: materials },
      });

      return { created, skipped, materials_upserted: materials };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/v1/expenses/import/commit error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to import expenses", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
