import { ACTIVE_JOB_STATUSES } from "@ai-fsm/domain";

/**
 * Jobs that appear in receipt / expense job pickers.
 * Closed work (completed, invoiced, cancelled) is excluded so field entry
 * stays short — only open / current projects.
 */
export const RECEIPT_LINKABLE_JOB_STATUSES = ACTIVE_JOB_STATUSES;

/** SQL list for `status IN (...)` — safe (enum constants only). */
export const RECEIPT_LINKABLE_JOB_STATUS_SQL = RECEIPT_LINKABLE_JOB_STATUSES.map(
  (s) => `'${s}'`,
).join(", ");

/**
 * Prefer in-progress jobs at the top of the picker.
 * @param alias table alias or empty (for bare column names)
 */
export function receiptJobOrderSql(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return `
    CASE ${p}status
      WHEN 'in_progress' THEN 0
      WHEN 'scheduled' THEN 1
      WHEN 'quoted' THEN 2
      WHEN 'draft' THEN 3
      ELSE 4
    END,
    ${p}updated_at DESC NULLS LAST,
    ${p}created_at DESC
  `;
}
