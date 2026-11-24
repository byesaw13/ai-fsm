import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { logger } from "@/lib/logger";
import { parsePurchaseCsv } from "@/lib/expenses/import/detect";
import { loadExpenseFingerprints, loadKnownKeys, planTrips, type ImportMode } from "@/lib/expenses/import/run";
import { pendingSummary } from "@/lib/expenses/import/reviews";
import {
  RECEIPT_LINKABLE_JOB_STATUS_SQL,
  receiptJobOrderSql,
} from "@/lib/expenses/open-jobs";
import { buildPoMatchText, suggestJobFromPoText } from "@/lib/expenses/match-job-po";
import { formatJobPickerLabel } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type JobRow = {
  id: string;
  title: string;
  job_number: string | null;
  client_id: string | null;
  client_name: string | null;
  address: string | null;
};

/**
 * Prefer exact Supply PO match on the HD job tag, then soft title/client/address.
 */
function suggestJob(
  jobName: string | null,
  jobs: JobRow[],
): { job_id: string; client_id: string | null; label: string } | null {
  const poHit = suggestJobFromPoText(buildPoMatchText({ job_name: jobName, notes: jobName }), jobs);
  if (poHit) {
    const j = jobs.find((row) => row.id === poHit.jobId);
    return {
      job_id: poHit.jobId,
      client_id: j?.client_id ?? null,
      label: formatJobPickerLabel(j?.title ?? poHit.jobNumber, j?.job_number ?? poHit.jobNumber),
    };
  }
  if (!jobName) return null;
  const n = norm(jobName);
  if (!n) return null;
  for (const j of jobs) {
    const hay = [norm(j.title), norm(j.client_name ?? ""), norm(j.address ?? "")];
    if (hay.some((h) => h && (h.includes(n) || n.includes(h)))) {
      return {
        job_id: j.id,
        client_id: j.client_id,
        label: formatJobPickerLabel(j.title, j.job_number),
      };
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
      { error: { code: "PAYLOAD_TOO_LARGE", message: "The file is over 5 MB. Export a shorter date range.", traceId: session.traceId } },
      { status: 413 }
    );
  }
  const mode: ImportMode = formData.get("mode") === "history" ? "history" : "book";

  let parsed;
  try {
    parsed = parsePurchaseCsv(await file.text());
  } catch (err) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: (err as Error).message, traceId: session.traceId } },
      { status: 422 }
    );
  }

  const source = parsed.source;
  if (parsed.totalRows > MAX_ROWS) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: `The file has ${parsed.totalRows.toLocaleString()} rows; the limit is 20,000. Export a shorter date range.`, traceId: session.traceId } },
      { status: 422 }
    );
  }

  try {
    const dates = [...new Set(parsed.transactions.map((t) => t.date))];
    const { existing, known, jobs, pending } = await withExpenseContext(session, async (client) => {
      const jobRows = await client.query<JobRow>(
        `SELECT j.id, j.title, j.job_number, j.client_id, c.name AS client_name, p.address
         FROM jobs j
         LEFT JOIN clients c ON c.id = j.client_id
         LEFT JOIN properties p ON p.id = j.property_id
         WHERE j.account_id = $1
           AND j.status IN (${RECEIPT_LINKABLE_JOB_STATUS_SQL})
         ORDER BY ${receiptJobOrderSql("j")}
         LIMIT 200`,
        [session.accountId]
      );
      return {
        existing: await loadExpenseFingerprints(client, session.accountId, dates),
        known: mode === "history" ? await loadKnownKeys(client, session.accountId, parsed.transactions) : new Set<string>(),
        jobs: jobRows.rows,
        pending: await pendingSummary(client, session.accountId),
      };
    });

    const plans = planTrips(parsed.transactions, existing, mode, known);
    const transactions = parsed.transactions.map((t, i) => ({
      ...t,
      plan: plans[i],
      suggestion: mode === "book" && plans[i].action !== "return" ? suggestJob(t.job_name, jobs) : null,
    }));

    const willImport = transactions.filter((t) => t.plan.action === "import" || t.plan.action === "link");
    const summary = {
      source,
      vendor_label: parsed.vendor_label,
      mode,
      rows_read: parsed.totalRows,
      total_transactions: transactions.length,
      new_importable: willImport.length,
      duplicates: transactions.filter((t) => t.plan.action === "already_imported").length,
      to_review: transactions.filter((t) => t.plan.action === "review").length,
      returns_skipped: transactions.filter((t) => t.plan.action === "return").length,
      total_cents: willImport.reduce((s, t) => s + t.amount_cents, 0),
      material_lines: willImport.reduce((s, t) => s + t.line_items.length, 0),
      skipped_rows: parsed.skipped,
      pending,
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
