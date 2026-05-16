import type { PoolClient } from "pg";

const SKIP_SECTIONS = new Set(["Closing"]);

type Disposition = "ok" | "fix_now" | "monitor" | "optional" | "refer" | null;

function deriveCondition(items: Disposition[]): "good" | "fair" | "poor" | "critical" | "not_assessed" {
  const assessed = items.filter((d) => d !== null);
  if (assessed.length === 0) return "not_assessed";

  const fixNowCount = items.filter((d) => d === "fix_now").length;
  if (fixNowCount >= 2) return "critical";
  if (fixNowCount >= 1) return "poor";
  if (items.some((d) => d === "monitor")) return "fair";
  return "good";
}

export async function seedConditionSnapshots(
  client: PoolClient,
  visitId: string,
  propertyId: string,
  accountId: string
): Promise<void> {
  const { rows } = await client.query<{ section: string; disposition: Disposition; note: string | null }>(
    `SELECT section, disposition, note
     FROM visit_checklist_items
     WHERE visit_id = $1 AND account_id = $2
     ORDER BY section, sort_order`,
    [visitId, accountId]
  );

  if (rows.length === 0) return;

  // Group by section, skip procedural sections
  const bySection = new Map<string, { dispositions: Disposition[]; notes: string[] }>();
  for (const row of rows) {
    if (SKIP_SECTIONS.has(row.section)) continue;
    if (!bySection.has(row.section)) bySection.set(row.section, { dispositions: [], notes: [] });
    const entry = bySection.get(row.section)!;
    entry.dispositions.push(row.disposition);
    if (row.note && (row.disposition === "fix_now" || row.disposition === "monitor")) {
      entry.notes.push(row.note);
    }
  }

  for (const [area, { dispositions, notes }] of bySection) {
    const condition = deriveCondition(dispositions);
    const note = notes.length > 0 ? notes.join("; ") : null;

    await client.query(
      `INSERT INTO property_condition_snapshots
         (account_id, property_id, visit_id, area, condition, note, assessed_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (visit_id, area) DO UPDATE
         SET condition = EXCLUDED.condition,
             note = EXCLUDED.note`,
      [accountId, propertyId, visitId, area, condition, note]
    );
  }
}
