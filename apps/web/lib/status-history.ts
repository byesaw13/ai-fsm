import type { PoolClient } from "pg";

export type StatusHistoryEntityType =
  | "job"
  | "visit"
  | "estimate"
  | "invoice"
  | "booking_request";

export async function recordStatusChange(
  client: PoolClient,
  opts: {
    accountId: string;
    entityType: StatusHistoryEntityType;
    entityId: string;
    fromStatus: string | null;
    toStatus: string;
    changedBy?: string | null;
    note?: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO status_history
       (account_id, entity_type, entity_id, from_status, to_status, changed_by, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.accountId,
      opts.entityType,
      opts.entityId,
      opts.fromStatus,
      opts.toStatus,
      opts.changedBy ?? null,
      opts.note ?? null,
    ]
  );
}
