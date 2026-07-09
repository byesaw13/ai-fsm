import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { replaceExpenseLineItems } from "@/lib/expenses/line-items";
import {
  RECEIPT_LINE_ITEMS_PROMPT,
  normalizeParsedReceiptLineItems,
  type ParsedReceipt,
} from "@/lib/expenses/receipt-line-items";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@ai-fsm/log/web";
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
      const expense = await client.query<{ id: string; receipt_url: string | null; vendor_name: string }>(
        `SELECT id, receipt_url, vendor_name FROM expenses WHERE id = $1 AND account_id = $2`,
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

      const anthropic = new Anthropic({ apiKey });
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
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

      const saved = await replaceExpenseLineItems(
        client,
        session.accountId,
        expenseId,
        lineItems.map((li, idx) => ({
          name: li.name,
          quantity: li.quantity,
          unit_cost_cents: li.unit_cost_cents,
          sku: li.sku ?? null,
          sort_order: idx,
        })),
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: expenseId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "parse_line_items", count: saved.length },
      });

      return { line_items: saved };
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