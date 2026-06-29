import type { PoolClient } from "pg";

export type WorkflowEventType =
  | "visit.scheduled"
  | "visit.completed"
  | "visit.cancelled"
  | "estimate.sent"
  | "estimate.approved"
  | "estimate.declined"
  | "invoice.sent"
  | "invoice.paid"
  | "invoice.void"
  | "payment.recorded"
  | "membership.cancelled";

export async function writeWorkflowEvent(
  client: PoolClient,
  opts: {
    accountId: string;
    eventType: WorkflowEventType;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO workflow_events (account_id, event_type, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      opts.accountId,
      opts.eventType,
      opts.entityType,
      opts.entityId,
      JSON.stringify(opts.payload ?? {}),
    ]
  );
}
