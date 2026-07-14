import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../lib/auth/middleware";
import { canManageExpenses } from "../../../../../lib/auth/permissions";
import { logger } from "../../../../../lib/logger";
import {
  RECEIPT_LINE_ITEMS_PROMPT,
  normalizeParsedReceiptLineItems,
  type ParsedReceipt,
} from "@/lib/expenses/receipt-line-items";

export const dynamic = "force-dynamic";

const EXPENSE_CATEGORIES = [
  "materials", "tools", "fuel", "vehicle", "subcontractors",
  "office", "insurance", "utilities", "marketing", "meals", "travel", "other",
] as const;

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!canManageExpenses(session.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Insufficient permissions", traceId: session.traceId } },
      { status: 403 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Receipt scanning is not configured", traceId: session.traceId } },
      { status: 503 }
    );
  }

  let imageBase64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  try {
    const formData = await request.formData();
    const file = formData.get("receipt") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "No receipt file provided", traceId: session.traceId } },
        { status: 422 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Receipt image must be under 5MB", traceId: session.traceId } },
        { status: 422 }
      );
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Unsupported image type — use JPEG, PNG, or WebP", traceId: session.traceId } },
        { status: 422 }
      );
    }
    mediaType = file.type as typeof mediaType;

    const buffer = await file.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString("base64");
  } catch (err) {
    logger.error("[scan-receipt] Failed to read upload", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Failed to read uploaded file", traceId: session.traceId } },
      { status: 422 }
    );
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: RECEIPT_LINE_ITEMS_PROMPT },
          ],
        },
      ],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Strip any markdown code fences Claude may have added
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: ParsedReceipt;
    try {
      parsed = JSON.parse(jsonText) as ParsedReceipt;
    } catch {
      logger.warn("[scan-receipt] Claude returned non-JSON", { raw: rawText, traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "PARSE_ERROR", message: "Could not extract receipt data — try a clearer photo", traceId: session.traceId } },
        { status: 422 }
      );
    }

    // Validate and normalise
    const category = EXPENSE_CATEGORIES.includes(parsed.category as typeof EXPENSE_CATEGORIES[number])
      ? parsed.category
      : "other";

    const amount_cents = typeof parsed.amount_cents === "number" && parsed.amount_cents > 0
      ? Math.round(parsed.amount_cents)
      : null;

    let expense_date: string | null = null;
    if (parsed.expense_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expense_date)) {
      expense_date = parsed.expense_date;
    }

    const line_items = normalizeParsedReceiptLineItems(parsed.line_items);

    return NextResponse.json({
      data: {
        vendor_name: parsed.vendor_name?.trim() || null,
        amount_cents,
        expense_date,
        category,
        notes: parsed.notes?.trim() || null,
        line_items,
      },
    });
  } catch (err) {
    logger.error("[scan-receipt] Anthropic API error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Receipt scanning failed — try again", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
