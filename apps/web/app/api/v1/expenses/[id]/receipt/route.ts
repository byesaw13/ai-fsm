import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

type ExpenseReceiptRow = {
  id: string;
  receipt_url: string | null;
};

function expenseIdFromPath(request: NextRequest): string | undefined {
  return request.nextUrl.pathname.split("/").at(-2);
}

function safeExtension(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ext) return ext;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";
  return "jpg";
}

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = expenseIdFromPath(request);
  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Expense not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  try {
    const expense = await withExpenseContext(session, async (client) => {
      const result = await client.query<ExpenseReceiptRow>(
        `SELECT id, receipt_url FROM expenses WHERE id = $1 AND account_id = $2`,
        [id, session.accountId]
      );
      return result.rows[0] ?? null;
    });

    if (!expense?.receipt_url) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Receipt not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const resolved = path.resolve(expense.receipt_url);
    const root = path.resolve("/app/uploads/expenses");
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Receipt file not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const buffer = fs.readFileSync(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType =
      ext === ".png" ? "image/png" :
      ext === ".webp" ? "image/webp" :
      ext === ".gif" ? "image/gif" :
      ext === ".heic" ? "image/heic" :
      ext === ".heif" ? "image/heif" :
      "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    logger.error("GET /api/v1/expenses/[id]/receipt error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch receipt", traceId: session.traceId } },
      { status: 500 }
    );
  }
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = expenseIdFromPath(request);
  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Expense not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Expected multipart form data", traceId: session.traceId } },
      { status: 422 }
    );
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "file is required", traceId: session.traceId } },
      { status: 422 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "File exceeds 10 MB limit", traceId: session.traceId } },
      { status: 422 }
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Only image files are allowed", traceId: session.traceId } },
      { status: 422 }
    );
  }

  const uploadDir = path.join("/app/uploads/expenses", id);
  const filePath = path.join(uploadDir, `${randomUUID()}.${safeExtension(file)}`);

  try {
    const expense = await withExpenseContext(session, async (client) => {
      const found = await client.query<ExpenseReceiptRow>(
        `SELECT id, receipt_url FROM expenses WHERE id = $1 AND account_id = $2`,
        [id, session.accountId]
      );
      if (!found.rows[0]) return null;

      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));

      const updated = await client.query<ExpenseReceiptRow>(
        `UPDATE expenses
         SET receipt_url = $1, updated_at = now()
         WHERE id = $2 AND account_id = $3
         RETURNING id, receipt_url`,
        [filePath, id, session.accountId]
      );
      return updated.rows[0] ?? null;
    });

    if (!expense) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: { id: expense.id, receipt_url: expense.receipt_url } }, { status: 201 });
  } catch (error) {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    logger.error("POST /api/v1/expenses/[id]/receipt error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to save receipt", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
