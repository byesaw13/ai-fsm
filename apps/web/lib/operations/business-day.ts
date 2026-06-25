import type { PoolClient } from "pg";
import type { BusinessDayStatus } from "@ai-fsm/domain";

/**
 * Business Day persistence helpers (TASK-051, Operations Engine Phase 1).
 *
 * The Business Day is a pure aggregate (see docs/canonical/OPERATIONS.md): these
 * helpers only create the container and move its own lifecycle status. They never
 * touch the records the day summarizes — closing a trip/activity/job is not a day
 * transition. The lifecycle rules live in `@ai-fsm/domain` (business-day.ts);
 * callers validate with `checkBusinessDayTransition` before calling
 * `setBusinessDayStatus`.
 *
 * All helpers expect a transaction `client` with the app.* RLS session vars set
 * (business_days uses FORCE ROW LEVEL SECURITY) — i.e. run inside `withDbSession`.
 */

export interface BusinessDayRow {
  id: string;
  user_id: string;
  business_date: string;
  status: BusinessDayStatus;
  opened_at: string;
  closed_at: string | null;
  reopened_reason: string | null;
  notes: string | null;
}

const COLS = `id, user_id, business_date::text AS business_date, status,
  opened_at::text AS opened_at, closed_at::text AS closed_at, reopened_reason, notes`;

export async function getBusinessDay(
  client: PoolClient,
  accountId: string,
  userId: string,
  date: string,
): Promise<BusinessDayRow | null> {
  const { rows } = await client.query<BusinessDayRow>(
    `SELECT ${COLS} FROM business_days
      WHERE account_id = $1 AND user_id = $2 AND business_date = $3`,
    [accountId, userId, date],
  );
  return rows[0] ?? null;
}

export async function getBusinessDayById(
  client: PoolClient,
  accountId: string,
  id: string,
): Promise<BusinessDayRow | null> {
  const { rows } = await client.query<BusinessDayRow>(
    `SELECT ${COLS} FROM business_days WHERE id = $1 AND account_id = $2`,
    [id, accountId],
  );
  return rows[0] ?? null;
}

/** Open today's business day if it isn't already (idempotent — one row per user/date). */
export async function openBusinessDay(
  client: PoolClient,
  accountId: string,
  userId: string,
  date: string,
  createdBy: string,
): Promise<BusinessDayRow> {
  await client.query(
    `INSERT INTO business_days (account_id, user_id, business_date, status, created_by)
     VALUES ($1, $2, $3, 'OPEN', $4)
     ON CONFLICT (account_id, user_id, business_date) DO NOTHING`,
    [accountId, userId, date, createdBy],
  );
  const row = await getBusinessDay(client, accountId, userId, date);
  if (!row) throw new Error("openBusinessDay: row missing after upsert");
  return row;
}

/**
 * Apply a validated status transition. closed_at is set only when CLOSED and
 * cleared otherwise (honoring the closed_at⇔CLOSED CHECK); reopened_reason is
 * recorded only on REOPENED. Validate with `checkBusinessDayTransition` first.
 */
export async function setBusinessDayStatus(
  client: PoolClient,
  accountId: string,
  id: string,
  to: BusinessDayStatus,
  reason: string | null,
): Promise<BusinessDayRow | null> {
  const { rows } = await client.query<BusinessDayRow>(
    `UPDATE business_days
        SET status = $3,
            closed_at = CASE WHEN $3 = 'CLOSED' THEN now() ELSE NULL END,
            reopened_reason = CASE WHEN $3 = 'REOPENED' THEN $4 ELSE reopened_reason END
      WHERE id = $2 AND account_id = $1
      RETURNING ${COLS}`,
    [accountId, id, to, reason],
  );
  return rows[0] ?? null;
}
