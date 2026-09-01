import type { PromiseEntityType } from "@ai-fsm/domain";
import { withDbSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import { BUSINESS_TIMEZONE } from "@/lib/operations/business-day";

export type PromiseEntitySource =
  | "today_visit"
  | "open_estimate"
  | "unpaid_invoice"
  | "search";

export type PromiseEntityOption = {
  entityType: PromiseEntityType;
  entityId: string;
  label: string;
  customerName: string;
  source: PromiseEntitySource;
};

export type VisitJobInput = {
  workOrderId: string | null;
  /** work_orders.job_id — not visits.job_id. Skip when null. */
  parentJobId: string | null;
  jobTitle: string | null;
  jobNumber: string | null;
  customerName: string | null;
};

function optionKey(option: PromiseEntityOption): string {
  return `${option.entityType}:${option.entityId}`;
}

function labelJob(customer: string, jobNumber: string | null, title: string | null): string {
  const number = jobNumber ? `${jobNumber} ` : "";
  return `${customer} — ${number}${title ?? "Job"}`;
}

/** Today's visit → parent job. Skip operational visits and WOs with no job. */
export function mapVisitToJobEntity(visit: VisitJobInput): PromiseEntityOption | null {
  if (!visit.workOrderId || !visit.parentJobId) return null;
  const customerName = visit.customerName?.trim() || "Customer";
  return {
    entityType: "job",
    entityId: visit.parentJobId,
    label: labelJob(customerName, visit.jobNumber, visit.jobTitle),
    customerName,
    source: "today_visit",
  };
}

export function assemblePromiseEntities(input: {
  visitJobs: PromiseEntityOption[];
  estimates: PromiseEntityOption[];
  invoices: PromiseEntityOption[];
  searchHits?: PromiseEntityOption[];
}): PromiseEntityOption[] {
  const seen = new Set<string>();
  const out: PromiseEntityOption[] = [];
  for (const item of [
    ...input.visitJobs,
    ...input.estimates,
    ...input.invoices,
    ...(input.searchHits ?? []),
  ]) {
    const key = optionKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function filterPromiseEntities(
  options: PromiseEntityOption[],
  query: string,
): PromiseEntityOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (option) =>
      option.customerName.toLowerCase().includes(q) ||
      option.label.toLowerCase().includes(q),
  );
}

type VisitRow = {
  work_order_id: string | null;
  parent_job_id: string | null;
  job_title: string | null;
  job_number: string | null;
  customer_name: string | null;
};

type EstimateRow = {
  id: string;
  estimate_number: string | null;
  customer_name: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
};

type SearchRow = {
  entity_type: PromiseEntityType;
  entity_id: string;
  label_part: string | null;
  customer_name: string | null;
};

function estimateOption(row: EstimateRow): PromiseEntityOption {
  const customerName = row.customer_name?.trim() || "Customer";
  return {
    entityType: "estimate",
    entityId: row.id,
    label: `${customerName} — ${row.estimate_number ?? "Estimate"}`,
    customerName,
    source: "open_estimate",
  };
}

function invoiceOption(row: InvoiceRow): PromiseEntityOption {
  const customerName = row.customer_name?.trim() || "Customer";
  return {
    entityType: "invoice",
    entityId: row.id,
    label: `${customerName} — ${row.invoice_number}`,
    customerName,
    source: "unpaid_invoice",
  };
}

function searchOption(row: SearchRow): PromiseEntityOption {
  const customerName = row.customer_name?.trim() || "Customer";
  const part = row.label_part?.trim();
  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    label: part ? `${customerName} — ${part}` : customerName,
    customerName,
    source: "search",
  };
}

/**
 * Likely attach targets: today's visit jobs, open estimates, unpaid invoices,
 * then optional customer-name search across supported entity types.
 */
export async function loadPromiseEntityOptions(
  session: SessionPayload,
  opts: { date: string; customerQuery?: string },
): Promise<PromiseEntityOption[]> {
  const tz = BUSINESS_TIMEZONE;
  const query = opts.customerQuery?.trim() ?? "";

  return withDbSession(session, async (client) => {
    const visitPromise = client.query<VisitRow>(
      `SELECT v.work_order_id,
              wo.job_id AS parent_job_id,
              j.title AS job_title,
              j.job_number,
              c.name AS customer_name
       FROM visits v
       JOIN work_orders wo ON wo.id = v.work_order_id AND wo.account_id = v.account_id
       JOIN jobs j ON j.id = wo.job_id AND j.account_id = v.account_id
       JOIN clients c ON c.id = j.client_id AND c.account_id = v.account_id
       WHERE v.account_id = $1
         AND v.status IS DISTINCT FROM 'cancelled'
         AND wo.job_id IS NOT NULL
         AND (
           (v.scheduled_start AT TIME ZONE $3)::date = $2::date
           OR (v.arrived_at AT TIME ZONE $3)::date = $2::date
           OR (v.completed_at AT TIME ZONE $3)::date = $2::date
         )
       ORDER BY COALESCE(v.arrived_at, v.scheduled_start) ASC NULLS LAST`,
      [session.accountId, opts.date, tz],
    );

    const estimatePromise = client.query<EstimateRow>(
      `SELECT e.id, e.estimate_number, c.name AS customer_name
       FROM estimates e
       JOIN clients c ON c.id = e.client_id AND c.account_id = e.account_id
       WHERE e.account_id = $1
         AND e.status IN ('draft', 'sent')
       ORDER BY e.updated_at DESC
       LIMIT 50`,
      [session.accountId],
    );

    const invoicePromise = client.query<InvoiceRow>(
      `SELECT i.id, i.invoice_number, c.name AS customer_name
       FROM invoices i
       JOIN clients c ON c.id = i.client_id AND c.account_id = i.account_id
       WHERE i.account_id = $1
         AND i.status IN ('draft', 'sent', 'partial', 'overdue')
       ORDER BY i.due_date ASC NULLS LAST, i.created_at DESC
       LIMIT 50`,
      [session.accountId],
    );

    const like = query ? `%${query}%` : null;
    const searchPromise = like
      ? client.query<SearchRow>(
          `SELECT * FROM (
             SELECT 'job'::text AS entity_type,
                    j.id AS entity_id,
                    COALESCE(j.job_number || ' ', '') || j.title AS label_part,
                    c.name AS customer_name
             FROM jobs j
             JOIN clients c ON c.id = j.client_id AND c.account_id = j.account_id
             WHERE j.account_id = $1
               AND j.status <> 'cancelled'
               AND c.name ILIKE $2
             UNION ALL
             SELECT 'estimate', e.id, COALESCE(e.estimate_number, 'Estimate'), c.name
             FROM estimates e
             JOIN clients c ON c.id = e.client_id AND c.account_id = e.account_id
             WHERE e.account_id = $1 AND c.name ILIKE $2
             UNION ALL
             SELECT 'invoice', i.id, i.invoice_number, c.name
             FROM invoices i
             JOIN clients c ON c.id = i.client_id AND c.account_id = i.account_id
             WHERE i.account_id = $1 AND c.name ILIKE $2
             UNION ALL
             SELECT 'booking_request', br.id,
                    COALESCE(NULLIF(br.service_description, ''), 'Request'),
                    COALESCE(c.name, br.name)
             FROM booking_requests br
             LEFT JOIN clients c ON c.id = br.client_id AND c.account_id = br.account_id
             WHERE br.account_id = $1
               AND br.status NOT IN ('cancelled', 'lost', 'duplicate', 'converted')
               AND (br.name ILIKE $2 OR c.name ILIKE $2)
           ) hits
           LIMIT 40`,
          [session.accountId, like],
        )
      : client.query<SearchRow>(
          `SELECT 'booking_request'::text AS entity_type,
                  br.id AS entity_id,
                  COALESCE(NULLIF(br.service_description, ''), 'Request') AS label_part,
                  COALESCE(c.name, br.name) AS customer_name
           FROM booking_requests br
           LEFT JOIN clients c ON c.id = br.client_id AND c.account_id = br.account_id
           WHERE br.account_id = $1
             AND br.status IN ('pending', 'needs_info', 'reviewed', 'assessment_booked', 'estimated')
           ORDER BY br.created_at DESC
           LIMIT 30`,
          [session.accountId],
        );

    const [visits, estimates, invoices, search] = await Promise.all([
      visitPromise,
      estimatePromise,
      invoicePromise,
      searchPromise,
    ]);

    return assemblePromiseEntities({
      visitJobs: visits.rows.flatMap((row) => {
        const mapped = mapVisitToJobEntity({
          workOrderId: row.work_order_id,
          parentJobId: row.parent_job_id,
          jobTitle: row.job_title,
          jobNumber: row.job_number,
          customerName: row.customer_name,
        });
        return mapped ? [mapped] : [];
      }),
      estimates: estimates.rows.map(estimateOption),
      invoices: invoices.rows.map(invoiceOption),
      searchHits: search.rows.map(searchOption),
    });
  });
}
