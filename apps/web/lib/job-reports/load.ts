import type { PoolClient } from "pg";
import { prefillSummary, resolveRecipient, type Recipient, type ReportRecord } from "./logic";

export interface ReportPhoto {
  id: string;
  visit_id: string;
  category: string;
}

export interface ReportRow {
  id: string;
  status: "draft" | "published" | "withdrawn";
  share_token: string;
  title: string;
  summary: string;
  area: string | null;
  work_type: string | null;
  media_ids: string[];
  records: ReportRecord[];
  published_at: string | null;
  view_count: number;
  first_viewed_at: string | null;
}

export interface ReportEditorData {
  job: { id: string; title: string; status: string; property_id: string | null; address: string | null };
  recipient: Recipient & { name?: string; email?: string | null; phone?: string | null; smsConsent?: boolean };
  photos: ReportPhoto[];
  /** Customer-visible materials lines — offered unticked for "keep for your records". */
  materialLines: string[];
  prefill: { title: string; summary: string };
  report: ReportRow | null;
}

/** Customer-facing photo categories. Receipts are never offered or served. */
export const REPORT_PHOTO_CATEGORIES = ["after", "before", "during", "assessment"] as const;

/** Everything the staff "Customer report" page needs. Caller sets RLS context. */
export async function loadReportEditor(
  db: PoolClient,
  accountId: string,
  jobId: string,
): Promise<ReportEditorData | null> {
  const { rows: jobs } = await db.query<ReportEditorData["job"]>(
    `SELECT j.id::text, j.title, j.status, j.property_id::text, p.address
     FROM jobs j LEFT JOIN properties p ON p.id = j.property_id
     WHERE j.id = $1 AND j.account_id = $2`,
    [jobId, accountId],
  );
  const job = jobs[0];
  if (!job) return null;

  const [invoices, photos, lines, reports] = await Promise.all([
    db.query<{ client_id: string; status: string; billing_context: string; work_summary: string | null }>(
      `SELECT client_id::text, status, billing_context, work_summary
       FROM invoices WHERE job_id = $1 AND account_id = $2 ORDER BY created_at DESC`,
      [jobId, accountId],
    ),
    db.query<ReportPhoto>(
      `SELECT vm.id::text, vm.visit_id::text, vm.category
       FROM visit_media vm JOIN visits v ON v.id = vm.visit_id AND v.account_id = vm.account_id
       WHERE v.job_id = $1 AND vm.account_id = $2 AND vm.category = ANY($3::text[])
       ORDER BY CASE vm.category WHEN 'after' THEN 0 WHEN 'before' THEN 1 ELSE 2 END, vm.created_at`,
      [jobId, accountId, [...REPORT_PHOTO_CATEGORIES]],
    ),
    db.query<{ description: string; line_item_type: string }>(
      `SELECT DISTINCT ON (li.description) li.description, li.line_item_type
       FROM invoice_line_items li JOIN invoices i ON i.id = li.invoice_id
       WHERE i.job_id = $1 AND i.account_id = $2 AND li.visible_to_customer
         AND i.status NOT IN ('draft', 'void') AND li.line_item_type IN ('labor', 'materials')
       ORDER BY li.description`,
      [jobId, accountId],
    ),
    db.query<ReportRow>(
      `SELECT id::text, status, share_token::text, title, summary, area, work_type,
              media_ids::text[] AS media_ids, records, published_at, view_count, first_viewed_at
       FROM portal_job_updates WHERE job_id = $1 AND account_id = $2`,
      [jobId, accountId],
    ),
  ]);

  const base = resolveRecipient(invoices.rows);
  let recipient: ReportEditorData["recipient"] = base;
  if (base.ok) {
    const { rows } = await db.query<{ name: string; email: string | null; phone: string | null; sms_consent: boolean }>(
      `SELECT name, email, phone, sms_consent FROM clients WHERE id = $1 AND account_id = $2`,
      [base.clientId, accountId],
    );
    recipient = { ...base, name: rows[0]?.name, email: rows[0]?.email, phone: rows[0]?.phone, smsConsent: rows[0]?.sms_consent };
  }

  return {
    job,
    recipient,
    photos: photos.rows,
    materialLines: lines.rows.filter((l) => l.line_item_type === "materials").map((l) => l.description),
    prefill: {
      title: job.title,
      summary: prefillSummary({
        workSummaries: invoices.rows.filter((i) => i.status !== "void").map((i) => i.work_summary),
        laborLines: lines.rows.filter((l) => l.line_item_type === "labor").map((l) => l.description),
        jobTitle: job.title,
        clientName: recipient.ok ? recipient.name : null,
      }),
    },
    report: reports.rows[0] ?? null,
  };
}
