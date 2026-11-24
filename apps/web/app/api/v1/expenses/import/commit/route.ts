import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { importTrips } from "@/lib/expenses/import/run";
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
  sku: z.string().max(100).nullable().default(null),
  name: z.string().min(1).max(255),
  category: z.enum(MATERIAL_CATEGORIES).default("other"),
  unit_cost_cents: z.number().int(),
  quantity: z.number().default(1),
  discounted: z.boolean().default(false),
});

const txnSchema = z.object({
  trip_key: z.string().min(1).max(300),
  external_ref: z.string().min(1).max(100).nullable(),
  store_number: z.string().max(50).nullable().default(null),
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
  mode: z.enum(["history", "book"]),
  transactions: z.array(txnSchema).min(1).max(20_000),
  rows_read: z.number().int().nonnegative().optional(),
  rejected: z.number().int().nonnegative().optional(),
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
  const { source, mode, transactions, rows_read, rejected } = parsed.data;

  try {
    const report = await withExpenseContext(session, (client) =>
      importTrips(
        client,
        { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
        { mode, source, trips: transactions, rowsRead: rows_read, rejected },
      ),
    );
    return NextResponse.json({ data: report }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/v1/expenses/import/commit error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to import expenses", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
