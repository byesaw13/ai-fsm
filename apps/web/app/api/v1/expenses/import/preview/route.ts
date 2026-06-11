import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { logger } from "@/lib/logger";
import { parseHomeDepotCsv } from "@/lib/expenses/import/homedepot";

export const dynamic = "force-dynamic";

const SOURCE = "home_depot_csv";
const MAX_SIZE = 5 * 1024 * 1024;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type JobRow = { id: string; title: string; client_id: string | null; client_name: string | null; address: string | null };

/** Best-effort match of an HD job tag to an app job, by job title / client / address. */
function suggestJob(jobName: string | null, jobs: JobRow[]): { job_id: string; client_id: string | null; label: string } | null {
  if (!jobName) return null;
  const n = norm(jobName);
  if (!n) return null;
  for (const j of jobs) {
    const hay = [norm(j.title), norm(j.client_name ?? ""), norm(j.address ?? "")];
    if (hay.some((h) => h && (h.includes(n) || n.includes(h)))) {
      return { job_id: j.id, client_id: j.client_id, label: j.title };
    }
  }
  return null;
}

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Expected a CSV file upload", traceId: session.traceId } },
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
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "File exceeds 5 MB limit", traceId: session.traceId } },
      { status: 422 }
    );
  }

  let parsed;
  try {
    parsed = parseHomeDepotCsv(await file.text());
  } catch (err) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: (err as Error).message, traceId: session.traceId } },
      { status: 422 }
    );
  }

  try {
    const { existingRefs, jobs } = await withExpenseContext(session, async (client) => {
      const refs = await client.query<{ external_ref: string }>(
        `SELECT external_ref FROM expenses WHERE account_id = $1 AND source = $2`,
        [session.accountId, SOURCE]
      );
      const jobRows = await client.query<JobRow>(
        `SELECT j.id, j.title, j.client_id, c.name AS client_name, p.address
         FROM jobs j
         LEFT JOIN clients c ON c.id = j.client_id
         LEFT JOIN properties p ON p.id = j.property_id
         WHERE j.account_id = $1 AND j.status NOT IN ('cancelled')
         ORDER BY j.created_at DESC
         LIMIT 500`,
        [session.accountId]
      );
      return { existingRefs: new Set(refs.rows.map((r) => r.external_ref)), jobs: jobRows.rows };
    });

    const transactions = parsed.transactions.map((t) => ({
      ...t,
      already_imported: existingRefs.has(t.external_ref),
      suggestion: t.is_return ? null : suggestJob(t.job_name, jobs),
    }));

    const importable = transactions.filter((t) => !t.already_imported && !t.is_return);
    const summary = {
      source: SOURCE,
      total_transactions: transactions.length,
      new_importable: importable.length,
      duplicates: transactions.filter((t) => t.already_imported).length,
      returns_skipped: transactions.filter((t) => t.is_return).length,
      total_cents: importable.reduce((s, t) => s + t.amount_cents, 0),
      material_lines: importable.reduce((s, t) => s + t.line_items.length, 0),
    };

    return NextResponse.json({ data: { transactions, summary } });
  } catch (error) {
    logger.error("POST /api/v1/expenses/import/preview error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to parse import", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
