import type { Client } from "pg";
import { logger } from "./logger.js";
import type { AutomationRow, RunResult } from "./automations/types.js";

/**
 * Property Issue Scan Automation
 *
 * Detects recurring problems by scanning visit_checklist_items for the same
 * item_key flagged as fix_now or monitor across 2+ visits within the lookback
 * window. Creates or increments property_issues rows with severity escalation.
 *
 * Severity ladder:
 *   2 occurrences              → minor
 *   3 occurrences              → moderate
 *   4+ within 12 months        → major
 *   any fix_now flagged 2+ times → critical
 */

interface RecurringItem {
  property_id: string;
  area: string;
  item_key: string;
  label: string;
  occurrence_count: number;
  fix_now_count: number;
  first_noted_at: string;
  last_noted_at: string;
  last_note: string | null;
  within_12mo: number;
}

export async function findDuePropertyIssueScans(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
       FROM automations
      WHERE type = 'property_issue_scan'
        AND enabled = true
        AND next_run_at <= now()`
  );
  return rows;
}

async function findRecurringItems(
  client: Client,
  automation: AutomationRow
): Promise<RecurringItem[]> {
  const cfg = automation.config as { min_occurrences?: number; lookback_months?: number };
  const minOccurrences = cfg.min_occurrences ?? 2;
  const lookbackMonths = cfg.lookback_months ?? 18;

  const { rows } = await client.query<RecurringItem>(
    `SELECT
       j.property_id,
       ci.section                                                       AS area,
       ci.item_key,
       MAX(ci.label)                                                    AS label,
       COUNT(DISTINCT ci.visit_id)::int                                 AS occurrence_count,
       COUNT(*) FILTER (WHERE ci.disposition = 'fix_now')::int         AS fix_now_count,
       MIN(ci.created_at)::text                                         AS first_noted_at,
       MAX(ci.created_at)::text                                         AS last_noted_at,
       MAX(ci.note) FILTER (WHERE ci.disposition IN ('fix_now','monitor')) AS last_note,
       COUNT(DISTINCT ci.visit_id) FILTER (
         WHERE ci.created_at > now() - interval '12 months'
       )::int AS within_12mo
     FROM visit_checklist_items ci
     JOIN visits v  ON v.id  = ci.visit_id  AND v.account_id  = ci.account_id
     JOIN jobs   j  ON j.id  = v.job_id     AND j.account_id  = ci.account_id
     WHERE ci.account_id = $1
       AND ci.disposition IN ('fix_now','monitor')
       AND ci.created_at  > now() - ($2 || ' months')::interval
       AND j.property_id IS NOT NULL
       AND ci.section <> 'Closing'
     GROUP BY j.property_id, ci.section, ci.item_key
     HAVING COUNT(DISTINCT ci.visit_id) >= $3
     ORDER BY occurrence_count DESC`,
    [automation.account_id, lookbackMonths, minOccurrences]
  );

  return rows;
}

function deriveSeverity(item: RecurringItem): "minor" | "moderate" | "major" | "critical" {
  if (item.fix_now_count >= 2) return "critical";
  if (item.within_12mo >= 4) return "major";
  if (item.occurrence_count >= 3) return "moderate";
  return "minor";
}

async function upsertPropertyIssue(
  client: Client,
  item: RecurringItem,
  accountId: string
): Promise<boolean> {
  const severity = deriveSeverity(item);
  const title = item.label.charAt(0).toUpperCase() + item.label.slice(1);

  await client.query(
    `INSERT INTO property_issues
       (account_id, property_id, area, item_key, title, description,
        first_noted_at, last_noted_at, occurrence_count, severity, auto_detected)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10, true)
     ON CONFLICT (property_id, item_key) WHERE status IN ('open','monitoring')
     DO UPDATE SET
       occurrence_count = GREATEST(EXCLUDED.occurrence_count, property_issues.occurrence_count),
       last_noted_at    = GREATEST(EXCLUDED.last_noted_at, property_issues.last_noted_at),
       severity         = EXCLUDED.severity,
       updated_at       = now()`,
    [
      accountId,
      item.property_id,
      item.area,
      item.item_key,
      title,
      item.last_note ?? null,
      item.first_noted_at,
      item.last_noted_at,
      item.occurrence_count,
      severity,
    ]
  );

  return true;
}

export async function processPropertyIssueScan(
  client: Client,
  automation: AutomationRow
): Promise<RunResult> {
  const result: RunResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const items = await findRecurringItems(client, automation);
  for (const item of items) {
    try {
      await upsertPropertyIssue(client, item, automation.account_id);
      result.sent++;
    } catch (error) {
      result.errors++;
      logger.error("property-issue-scan: failed to upsert issue", error, {
        propertyId: item.property_id, itemKey: item.item_key,
      });
    }
  }

  return result;
}
