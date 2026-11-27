import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import {
  RECEIPT_LINE_ITEMS_PROMPT,
  getReceiptParseModel,
  normalizeParsedReceiptLineItems,
  receiptAdjustmentsFrom,
  type ParsedReceipt,
} from "@/lib/expenses/receipt-line-items";
import { ReceiptRevisionError, saveReceiptRevision } from "@/lib/expenses/receipt-revisions";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const expenseId = request.nextUrl.pathname.split("/").at(-2)!;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "Receipt parsing is not configured",
          traceId: session.traceId,
        },
      },
      { status: 503 },
    );
  }

  try {
    const data = await withExpenseContext(session, async (client) => {
      const expense = await client.query<{
        id: string;
        receipt_url: string | null;
        vendor_name: string;
        category: string;
        expense_date: string;
      }>(
        `SELECT id, receipt_url, vendor_name, category, expense_date::text AS expense_date
         FROM expenses WHERE id = $1 AND account_id = $2`,
        [expenseId, session.accountId],
      );
      if ((expense.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Expense not found"), { code: "NOT_FOUND" });
      }
      const row = expense.rows[0];
      if (!row.receipt_url) {
        throw Object.assign(new Error("This expense has no receipt image to parse"), {
          code: "NO_RECEIPT",
        });
      }

      const receiptPath = path.resolve(row.receipt_url);
      const root = path.resolve("/app/uploads/expenses");
      if (!receiptPath.startsWith(root + path.sep) || !fs.existsSync(receiptPath)) {
        throw Object.assign(new Error("Receipt file not found on disk"), { code: "NO_RECEIPT" });
      }
      const buffer = fs.readFileSync(receiptPath);
      const ext = path.extname(receiptPath).toLowerCase();
      const mediaType =
        ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : "image/jpeg";

      const model = getReceiptParseModel();
      const anthropic = new Anthropic({ apiKey });
      const message = await anthropic.messages.create({
        model,
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: buffer.toString("base64"),
                },
              },
              { type: "text", text: RECEIPT_LINE_ITEMS_PROMPT },
            ],
          },
        ],
      });

      const rawText = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

      let parsed: ParsedReceipt;
      try {
        parsed = JSON.parse(jsonText) as ParsedReceipt;
      } catch {
        throw Object.assign(new Error("Could not parse receipt line items — try a clearer photo"), {
          code: "PARSE_ERROR",
        });
      }

      const lineItems = normalizeParsedReceiptLineItems(parsed.line_items);
      if (lineItems.length === 0) {
        throw Object.assign(new Error("No line items found on this receipt"), {
          code: "NO_LINE_ITEMS",
        });
      }

      const taxCents =
        typeof parsed.tax_cents === "number" && parsed.tax_cents > 0
          ? Math.round(parsed.tax_cents)
          : null;

      // A new numbered revision; the expense row lock serializes concurrent re-parses.
      const saved = await saveReceiptRevision(
        client,
        { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
        expenseId,
        {
          origin: "parse",
          lineItems: lineItems.map((li, idx) => ({
            name: li.name,
            quantity: li.quantity,
            unit_cost_cents: li.unit_cost_cents,
            sku: li.sku ?? null,
            sort_order: idx,
          })),
          taxCents,
          adjustments: receiptAdjustmentsFrom(parsed.line_items, parsed.adjustments),
        },
      );
      const { reconciliation, catalog_learned } = saved;
      if (reconciliation.balanced === false) {
        logger.warn("parse-line-items: receipt does not reconcile after tax, discounts and returns", {
          expenseId,
          model,
          ...reconciliation,
          traceId: session.traceId,
        });
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: expenseId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          action: "parse_line_items",
          revision: saved.revision,
          count: saved.line_items.length,
          catalog_learned,
          reconciliation,
          parse_model: model,
        },
      });

      return {
        line_items: saved.line_items,
        revision: saved.revision,
        catalog_learned,
        reconciliation,
        parse_model: model,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (error instanceof ReceiptRevisionError && error.code === "ALREADY_BILLED") {
      return NextResponse.json(
        { error: { code: "ALREADY_BILLED", message: error.message, traceId: session.traceId } },
        { status: 409 },
      );
    }
    if (err.code === "NO_RECEIPT" || err.code === "PARSE_ERROR" || err.code === "NO_LINE_ITEMS") {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: 400 },
      );
    }

    logger.error("POST /api/v1/expenses/[id]/parse-line-items error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to parse receipt line items",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});
