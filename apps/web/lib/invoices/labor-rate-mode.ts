import type { PoolClient } from "pg";
import { roundedQuarterHoursFromMinutes } from "./tracked-labor";
import {
  createInvoiceLineItem,
  updateInvoiceLineItem,
  upsertLaborLineFromTrackedTime,
  type InvoiceLineItemRow,
} from "./line-items";

export type LaborRateMode = "hourly" | "price_book" | "flat";

export type LaborLineInput = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_item_type: "labor";
};

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

export function laborLineInputForMode(args: {
  mode: LaborRateMode;
  trackedMinutes: number;
  billingRateCentsPerHour: number;
  priceBookName?: string;
  priceBookCents?: number;
  flatCents?: number;
}): LaborLineInput {
  if (args.mode === "hourly") {
    const hours = roundedQuarterHoursFromMinutes(args.trackedMinutes);
    if (hours <= 0) {
      fail("NO_TRACKED_TIME", "No completed visit time is available for this job");
    }
    return {
      description: "Labor",
      quantity: hours,
      unit_price_cents: args.billingRateCentsPerHour,
      line_item_type: "labor",
    };
  }

  if (args.mode === "price_book") {
    const cents = args.priceBookCents;
    const name = args.priceBookName?.trim();
    if (!name || cents == null || cents < 0) {
      fail("VALIDATION_ERROR", "Pick a price-book task with a rate");
    }
    return {
      description: name,
      quantity: 1,
      unit_price_cents: cents,
      line_item_type: "labor",
    };
  }

  const flat = args.flatCents;
  if (flat == null || !Number.isFinite(flat) || flat < 0) {
    fail("VALIDATION_ERROR", "Enter a flat fee");
  }
  return {
    description: "Labor",
    quantity: 1,
    unit_price_cents: Math.round(flat),
    line_item_type: "labor",
  };
}

async function upsertLaborLine(
  client: PoolClient,
  invoiceId: string,
  input: LaborLineInput,
): Promise<InvoiceLineItemRow> {
  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM invoice_line_items
     WHERE invoice_id = $1 AND line_item_type = 'labor'
     ORDER BY sort_order ASC, created_at ASC
     LIMIT 1`,
    [invoiceId],
  );
  return (existing.rowCount ?? 0) > 0
    ? updateInvoiceLineItem(client, invoiceId, existing.rows[0].id, input)
    : createInvoiceLineItem(client, invoiceId, input);
}

export async function applyLaborRateMode(
  client: PoolClient,
  args: {
    invoiceId: string;
    accountId: string;
    jobId: string;
    mode: LaborRateMode;
    priceBookId?: string;
    priceCents?: number;
    flatCents?: number;
  },
): Promise<InvoiceLineItemRow> {
  if (args.mode === "hourly") {
    const { lineItem } = await upsertLaborLineFromTrackedTime(
      client,
      args.invoiceId,
      args.accountId,
      args.jobId,
    );
    return lineItem;
  }

  let priceBookName: string | undefined;
  let priceBookCents: number | undefined;
  if (args.mode === "price_book") {
    if (!args.priceBookId) fail("VALIDATION_ERROR", "Pick a price-book task with a rate");
    const row = await client.query<{
      name: string;
      default_price_cents: number | null;
      price_min_cents: number;
    }>(
      `SELECT name, default_price_cents, price_min_cents
       FROM price_book
       WHERE id = $1 AND is_active = true`,
      [args.priceBookId],
    );
    if (!row.rows[0]) fail("NOT_FOUND", "Price-book task not found");
    priceBookName = row.rows[0].name;
    priceBookCents =
      args.priceCents ?? row.rows[0].default_price_cents ?? row.rows[0].price_min_cents;
  }

  const input = laborLineInputForMode({
    mode: args.mode,
    trackedMinutes: 0,
    billingRateCentsPerHour: 0,
    priceBookName,
    priceBookCents,
    flatCents: args.flatCents,
  });
  return upsertLaborLine(client, args.invoiceId, input);
}
