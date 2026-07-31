/**
 * Server-side Job Ledger loader — composes estimate, hours, expenses, COs, payments.
 */
import type { SessionPayload } from "@/lib/auth/session";
import { queryForSession, queryOneForSession } from "@/lib/db";
import {
  buildJobLedger,
  type JobLedgerSummary,
  type ExpenseCommercialTag,
} from "@ai-fsm/domain";

type EstimateLineRow = {
  description: string;
  quantity: string | number;
  unit_price_cents: number;
  total_cents: number;
  line_item_type: string | null;
};

type ExpenseRow = {
  amount_cents: number;
  commercial_tag: string | null;
  category: string;
  notes: string | null;
  vendor_name: string;
};

type ChangeOrderRow = {
  id: string;
  title: string;
  status: string;
  total_cents: number;
  subtotal_cents: number;
};

/** Optional preloaded facts so the job page can avoid duplicate queries. */
export type JobLedgerPreload = {
  trackedLaborMinutes: number;
  materialsExpenses: {
    amount_cents: number;
    commercial_tag?: string | null;
    notes?: string | null;
    vendor_name?: string;
  }[];
  /** All non-materials job expenses (tools, other, etc.) for equipment heuristic. */
  otherExpenses?: {
    amount_cents: number;
    commercial_tag?: string | null;
    category?: string | null;
    notes?: string | null;
    vendor_name?: string;
  }[];
  paidCents?: number;
};

export async function loadJobLedger(
  session: SessionPayload,
  jobId: string,
  preload?: JobLedgerPreload,
): Promise<JobLedgerSummary | null> {
  const commercial = await queryOneForSession<{
    approved_estimate_id: string | null;
    latest_estimate_id: string | null;
    estimate_pricing_mode: string | null;
    booking_pricing_mode: string | null;
    paid_cents: string | null;
  }>(
    session,
    `SELECT
       (SELECT id FROM estimates
        WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
        ORDER BY created_at DESC LIMIT 1) AS approved_estimate_id,
       (SELECT id FROM estimates
        WHERE job_id = $1 AND account_id = $2
          AND status NOT IN ('declined')
        ORDER BY
          CASE status WHEN 'approved' THEN 0 WHEN 'sent' THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT 1) AS latest_estimate_id,
       (SELECT pricing_mode FROM estimates
        WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
        ORDER BY created_at DESC LIMIT 1) AS estimate_pricing_mode,
       (SELECT pricing_mode FROM booking_requests
        WHERE job_id = $1 AND account_id = $2
        ORDER BY created_at DESC LIMIT 1) AS booking_pricing_mode,
       -- Pretax-allocated paid: when invoice has tax, scale paid by subtotal/total
       (SELECT COALESCE(SUM(
          CASE
            WHEN total_cents > 0 AND tax_cents > 0
              THEN ROUND(paid_cents::numeric * subtotal_cents / total_cents)
            ELSE paid_cents
          END
        ), 0)::text FROM invoices
        WHERE job_id = $1 AND account_id = $2 AND status != 'void') AS paid_cents
    `,
    [jobId, session.accountId],
  );

  if (!commercial) return null;

  const estimateId = commercial.approved_estimate_id ?? commercial.latest_estimate_id;

  let estimate: {
    id: string;
    number: string | null;
    status: string;
    total_cents: number;
    subtotal_cents?: number | null;
    tax_cents?: number | null;
    line_items: {
      description: string;
      quantity: number;
      unit_price_cents: number;
      total_cents: number;
      line_item_type?: string | null;
    }[];
  } | null = null;

  let pricingModeFromEstimate: string | null = commercial.estimate_pricing_mode;

  if (estimateId) {
    const est = await queryOneForSession<{
      id: string;
      estimate_number: string | null;
      status: string;
      total_cents: number;
      subtotal_cents: number | null;
      tax_cents: number | null;
      pricing_mode: string | null;
    }>(
      session,
      `SELECT id, estimate_number, status, total_cents, subtotal_cents, tax_cents, pricing_mode
       FROM estimates WHERE id = $1 AND account_id = $2`,
      [estimateId, session.accountId],
    );
    if (est) {
      pricingModeFromEstimate = est.pricing_mode ?? pricingModeFromEstimate;
      // option_id IS NULL — exclude competing Good/Better/Best option rows
      // (same rule as final-invoice / travel loaders).
      const lines = await queryForSession<EstimateLineRow>(
        session,
        `SELECT description, quantity, unit_price_cents, total_cents, line_item_type
         FROM estimate_line_items
         WHERE estimate_id = $1 AND option_id IS NULL
         ORDER BY sort_order ASC, created_at ASC`,
        [estimateId],
      );
      estimate = {
        id: est.id,
        number: est.estimate_number,
        status: est.status,
        total_cents: est.total_cents,
        subtotal_cents: est.subtotal_cents,
        tax_cents: est.tax_cents,
        line_items: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unit_price_cents: l.unit_price_cents,
          total_cents: l.total_cents,
          line_item_type: l.line_item_type,
        })),
      };
    }
  }

  const changeOrders = estimateId
    ? await queryForSession<ChangeOrderRow>(
        session,
        `SELECT id, title, status, total_cents, subtotal_cents
         FROM change_orders
         WHERE estimate_id = $1 AND account_id = $2
         ORDER BY created_at DESC`,
        [estimateId, session.accountId],
      )
    : [];

  let trackedLaborMinutes = preload?.trackedLaborMinutes ?? 0;
  if (preload?.trackedLaborMinutes == null) {
    const row = await queryOneForSession<{ minutes: string }>(
      session,
      `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at)) / 60), 0)::numeric AS minutes
       FROM activity_entries ae
       WHERE ae.account_id = $2
         AND ae.activity_type = 'job_work'
         AND ae.voided_at IS NULL
         AND ae.ended_at IS NOT NULL
         AND (
           (ae.entity_type = 'job' AND ae.entity_id = $1)
           OR (ae.entity_type = 'visit' AND ae.entity_id IN (
             SELECT v.id FROM visits v WHERE v.job_id = $1 AND v.account_id = $2
           ))
         )`,
      [jobId, session.accountId],
    );
    trackedLaborMinutes = Number(row?.minutes ?? 0);
  }

  let materialsExpenses = preload?.materialsExpenses ?? [];
  let otherExpenses = preload?.otherExpenses ?? [];

  if (preload?.materialsExpenses == null) {
    const expenses = await queryForSession<ExpenseRow>(
      session,
      `SELECT amount_cents, commercial_tag, category, notes, vendor_name
       FROM expenses
       WHERE account_id = $2 AND job_id = $1`,
      [jobId, session.accountId],
    );
    materialsExpenses = expenses
      .filter((e) => e.category === "materials")
      .map((e) => ({
        amount_cents: e.amount_cents,
        commercial_tag: e.commercial_tag as ExpenseCommercialTag | null,
        notes: e.notes,
        vendor_name: e.vendor_name,
      }));
    otherExpenses = expenses
      .filter((e) => e.category !== "materials")
      .map((e) => ({
        amount_cents: e.amount_cents,
        commercial_tag: e.commercial_tag,
        category: e.category,
        notes: e.notes,
        vendor_name: e.vendor_name,
      }));
  }

  const modeStr = pricingModeFromEstimate ?? commercial.booking_pricing_mode ?? null;
  const pricingMode =
    modeStr === "hourly_internal" || modeStr === "flat_rate" ? modeStr : null;

  const paidCents =
    preload?.paidCents != null
      ? preload.paidCents
      : Number(commercial.paid_cents ?? 0);

  return buildJobLedger({
    jobId,
    pricingMode,
    estimate,
    trackedLaborMinutes,
    materialsExpenses,
    otherExpenses,
    changeOrders,
    paidCents,
  });
}
