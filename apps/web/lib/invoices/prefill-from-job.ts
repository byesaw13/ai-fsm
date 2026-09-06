/**
 * Build editable invoice line-item prefills from a project.
 *
 * T&M (hourly_internal): actual tracked labor + job material expenses.
 * Flat rate: approved estimate line items (caller may pass estimate id).
 * Quick-book jobs have no estimate or booking — they default to hourly.
 */
import { query, getPool } from "@/lib/db";
import {
  roundedQuarterHoursFromMinutes,
  trackedLaborMinutesFromActivityEntries,
} from "@/lib/invoices/tracked-labor";
import {
  equipmentLineItemsFromJobExpenses,
  materialLineItemsFromJobExpenses,
} from "@/lib/invoices/job-expenses";
import { LABOR_CUSTOMER_RATE_CENTS_PER_HOUR } from "@ai-fsm/domain";

export type PrefillLineItem = {
  description: string;
  quantity: string;
  unit_price: string;
};

export type JobPricingMode = "flat_rate" | "hourly_internal";

/**
 * Estimate wins, then booking. Quick-book jobs have neither — they bill hourly
 * at the account labor rate (TASK-119). A booking whose pricing_mode is still
 * NULL is undecided intake, not a quick job. Unrecognized strings stay null.
 */
export function jobPricingModeFromSources(
  estimatePricingMode: string | null | undefined,
  bookingPricingMode: string | null | undefined,
  options?: { hasBooking?: boolean },
): JobPricingMode | null {
  const mode = estimatePricingMode ?? bookingPricingMode ?? null;
  if (mode === "hourly_internal" || mode === "flat_rate") return mode;
  if (mode != null) return null;
  if (options?.hasBooking) return null;
  return "hourly_internal";
}

export async function resolveJobPricingMode(
  accountId: string,
  jobId: string,
): Promise<JobPricingMode | null> {
  const rows = await query<{
    estimate_pricing_mode: string | null;
    booking_pricing_mode: string | null;
    has_booking: boolean;
  }>(
    `SELECT
       (SELECT pricing_mode FROM estimates
        WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
        ORDER BY created_at DESC LIMIT 1) AS estimate_pricing_mode,
       (SELECT pricing_mode FROM booking_requests
        WHERE job_id = $1 AND account_id = $2
        ORDER BY created_at DESC LIMIT 1) AS booking_pricing_mode,
       EXISTS (
         SELECT 1 FROM booking_requests
         WHERE job_id = $1 AND account_id = $2
       ) AS has_booking`,
    [jobId, accountId],
  );
  return jobPricingModeFromSources(
    rows[0]?.estimate_pricing_mode,
    rows[0]?.booking_pricing_mode,
    { hasBooking: Boolean(rows[0]?.has_booking) },
  );
}

/**
 * Prefill line items from T&M actuals stored on the job (time + materials).
 * Uses a short-lived pool client for helpers that expect PoolClient.
 */
export async function prefillLineItemsFromTmActuals(
  accountId: string,
  jobId: string,
): Promise<PrefillLineItem[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const trackedMinutes = await trackedLaborMinutesFromActivityEntries(
      client,
      accountId,
      jobId,
    );
    const billableHours = roundedQuarterHoursFromMinutes(trackedMinutes);

    let billRate = LABOR_CUSTOMER_RATE_CENTS_PER_HOUR;
    const rateRow = await client.query<{ unit_price_cents: number }>(
      `SELECT eli.unit_price_cents
       FROM estimate_line_items eli
       JOIN estimates e ON e.id = eli.estimate_id
       WHERE e.job_id = $1
         AND e.account_id = $2
         AND e.status = 'approved'
         AND eli.option_id IS NULL
         AND eli.unit_price_cents > 0
         AND (
           eli.line_item_type = 'labor'
           OR lower(eli.description) LIKE '%labor%'
         )
       ORDER BY e.created_at DESC, eli.sort_order ASC
       LIMIT 1`,
      [jobId, accountId],
    );
    if (rateRow.rows[0]?.unit_price_cents) {
      billRate = rateRow.rows[0].unit_price_cents;
    } else {
      try {
        const { loadPricingSettings } = await import("@/lib/pricing/settings");
        const settings = await loadPricingSettings(client, accountId);
        billRate = settings.labor_billing_cents_per_hour;
      } catch {
        /* default */
      }
    }

    const items: PrefillLineItem[] = [];
    if (billableHours > 0) {
      items.push({
        description: "Labor",
        quantity: String(billableHours),
        unit_price: (billRate / 100).toFixed(2),
      });
    }

    // Create-invoice prefills have no line_item_type / source_expense_id, so
    // expenses would land as labor and the rate toggle would overwrite them.
    // Quoted T&M jobs still include receipts; quick jobs (no estimate) are labor-only.
    const approvedEstimate = await client.query(
      `SELECT 1 FROM estimates
       WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
       LIMIT 1`,
      [jobId, accountId],
    );
    if ((approvedEstimate.rowCount ?? 0) > 0) {
      const materials = await materialLineItemsFromJobExpenses(
        client,
        accountId,
        jobId,
        items.length,
      );
      for (const m of materials) {
        items.push({
          description: m.description,
          quantity: String(m.quantity),
          unit_price: (m.unit_price_cents / 100).toFixed(2),
        });
      }

      const equipment = await equipmentLineItemsFromJobExpenses(
        client,
        accountId,
        jobId,
        items.length,
      );
      for (const e of equipment) {
        items.push({
          description: e.description,
          quantity: String(e.quantity),
          unit_price: (e.unit_price_cents / 100).toFixed(2),
        });
      }
    }

    return items;
  } finally {
    client.release();
  }
}
