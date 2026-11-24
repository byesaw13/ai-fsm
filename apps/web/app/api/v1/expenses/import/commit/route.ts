import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import {
  expenseDateKey,
  findMatchingExpense,
  type ExpenseFingerprint,
} from "@/lib/expenses/duplicate-match";
import { appendAuditLog } from "@/lib/db/audit";
import { learnMaterialsFromLineItems } from "@/lib/materials/catalog";
import { observationFingerprints } from "@/lib/materials/ledger";
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
  discounted: z.boolean().default(false),
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
  source: z.enum(["home_depot_csv", "lowes_csv"]).default("home_depot_csv"),
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

      const dates = [...new Set(transactions.map((t) => t.date))];
      const existingRes = await client.query<{
        id: string;
        vendor_name: string;
        amount_cents: number;
        expense_date: string | Date;
        external_ref: string | null;
        source: string | null;
      }>(
        `SELECT id, vendor_name, amount_cents, expense_date, external_ref, source
         FROM expenses
         WHERE account_id = $1 AND expense_date = ANY($2::date[])`,
        [session.accountId, dates],
      );
      const fingerprints: ExpenseFingerprint[] = existingRes.rows.map((row) => ({
        id: row.id,
        vendor_name: row.vendor_name,
        amount_cents: row.amount_cents,
        expense_date: expenseDateKey(row.expense_date),
        external_ref: row.external_ref,
        source: row.source,
      }));

      for (const t of transactions) {
        const vendorLabel = source === "lowes_csv" ? "Lowe's" : "Home Depot";
        const notes =
          t.notes ??
          (t.line_items.length
            ? `${t.line_items.length} item(s) · imported from ${vendorLabel}`
            : `Imported from ${vendorLabel}`);
        const candidate: ExpenseFingerprint = {
          vendor_name: t.vendor,
          expense_date: t.date,
          amount_cents: t.amount_cents,
          external_ref: t.external_ref,
        };
        const matched = findMatchingExpense(candidate, fingerprints);
        if (matched?.id) {
          await client.query(
            `UPDATE expenses SET
               source = COALESCE(source, $3),
               external_ref = COALESCE(external_ref, $4),
               job_id = COALESCE(job_id, $5),
               client_id = COALESCE(client_id, $6),
               updated_at = now()
             WHERE id = $1 AND account_id = $2`,
            [
              matched.id,
              session.accountId,
              source,
              t.external_ref,
              t.job_id ?? null,
              t.client_id ?? null,
            ],
          );
          matched.external_ref = matched.external_ref ?? t.external_ref;
          skipped++;
        } else {
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
          if (ins.rows[0]) {
            created++;
            fingerprints.push({ ...candidate, id: ins.rows[0].id });
          } else {
            skipped++;
            continue;
          }
        }

        if (update_prices) {
          // Prices go through the ledger (TASK-210). A discounted (sale) purchase is
          // kept as evidence but never becomes the regular price.
          const priced = t.line_items.filter((li) => li.unit_cost_cents > 0); // returns / $0 lines skipped
          const keys = observationFingerprints(
            priced.map((li) => ({ sku: li.sku ?? null, name: li.name, unitPriceCents: li.unit_cost_cents, quantity: li.quantity ?? 1 })),
          );
          for (const [k, li] of priced.entries()) {
            const { learned } = await learnMaterialsFromLineItems(
              client,
              {
                accountId: session.accountId,
                supplier: t.vendor,
                purchasedAt: t.date,
                category: li.category,
                source: { kind: "supplier_csv", ref: `expense-import:${source}:${t.external_ref}` },
                enteredBy: session.userId,
              },
              [{
                name: li.name,
                unit_cost_cents: li.unit_cost_cents,
                sku: li.sku ?? null,
                quantity: li.quantity ?? 1,
                is_sale: li.discounted === true,
                dedupe_key: `csvtrip:${source}:${t.external_ref}:${keys[k]}`,
              }],
            );
            materials += learned;
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
