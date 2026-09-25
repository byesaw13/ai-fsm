import type { PoolClient } from "pg";
import { REPORT_PHOTO_CATEGORIES } from "./load";

/**
 * TASK-163 "Customer reports to send": finished jobs with customer photos that
 * have no published, withdrawn or skipped report. A saved draft stays in the
 * queue. One predicate feeds both the queue page and the Needs Attention count.
 * `$1` = account id, `$2` = customer photo categories. Jobs aliased `j`.
 */
export const REPORT_QUEUE_WHERE = `
  j.account_id = $1
  AND j.status IN ('completed', 'invoiced')
  AND EXISTS (
    SELECT 1 FROM visit_media vm JOIN visits v ON v.id = vm.visit_id AND v.account_id = vm.account_id
    WHERE v.job_id = j.id AND vm.category = ANY($2::text[]))
  AND NOT EXISTS (
    SELECT 1 FROM portal_job_updates r
    WHERE r.job_id = j.id AND r.status IN ('published', 'withdrawn', 'skipped'))`;

export const REPORT_QUEUE_PARAMS = (accountId: string) => [accountId, [...REPORT_PHOTO_CATEGORIES]];

export interface ReportQueueRow {
  job_id: string;
  title: string;
  client_name: string | null;
  address: string | null;
  finished_at: string | null;
  photo_count: number;
  has_draft: boolean;
  has_billed_invoice: boolean;
}

export async function loadReportQueue(db: PoolClient, accountId: string): Promise<ReportQueueRow[]> {
  const { rows } = await db.query<ReportQueueRow>(
    `SELECT j.id::text AS job_id, j.title, c.name AS client_name, p.address,
            COALESCE((SELECT max(v.completed_at) FROM visits v WHERE v.job_id = j.id), j.updated_at)::text AS finished_at,
            (SELECT count(*)::int FROM visit_media vm JOIN visits v ON v.id = vm.visit_id
             WHERE v.job_id = j.id AND vm.category = ANY($2::text[])) AS photo_count,
            EXISTS (SELECT 1 FROM portal_job_updates r WHERE r.job_id = j.id AND r.status = 'draft') AS has_draft,
            EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.status NOT IN ('draft', 'void')) AS has_billed_invoice
     FROM jobs j
     LEFT JOIN clients c ON c.id = j.client_id
     LEFT JOIN properties p ON p.id = j.property_id
     WHERE ${REPORT_QUEUE_WHERE}
     ORDER BY finished_at DESC
     LIMIT 200`,
    REPORT_QUEUE_PARAMS(accountId),
  );
  return rows;
}
