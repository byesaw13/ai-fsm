import type { Client } from "pg";
import { logger } from "./logger.js";
import { cancelNotificationsForEntity } from "./notification/enqueue.js";

interface WorkflowEvent {
  id: string;
  account_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
}

// Cancellation map: event_type → what to cancel in notification_queue
// The notification_queue rows have cancel_on_events[] populated at enqueue time.
// This processor just fires the cancel for each event received.
const CANCEL_TRIGGERS = new Set([
  "visit.cancelled",
  "estimate.approved",
  "estimate.declined",
  "invoice.paid",
  "invoice.void",
  "membership.cancelled",
]);

export async function processWorkflowEvents(client: Client): Promise<number> {
  const { rows } = await client.query<WorkflowEvent>(
    `SELECT id, account_id, event_type, entity_type, entity_id, payload
     FROM workflow_events
     WHERE processed = false
     ORDER BY created_at ASC
     LIMIT 100`
  );

  if (rows.length === 0) return 0;

  let processed = 0;
  for (const event of rows) {
    try {
      // Cancel any pending notifications that listen for this event
      if (CANCEL_TRIGGERS.has(event.event_type)) {
        const cancelled = await cancelNotificationsForEntity(
          client,
          event.entity_type,
          event.entity_id,
          event.event_type
        );
        if (cancelled > 0) {
          logger.info("workflow-events: cancelled pending notifications", {
            eventType: event.event_type,
            entityId: event.entity_id,
            cancelled,
          });
        }
      }

      await client.query(
        `UPDATE workflow_events SET processed = true, processed_at = now() WHERE id = $1`,
        [event.id]
      );
      processed++;
    } catch (err) {
      logger.error("workflow-events: failed to process event", err, { eventId: event.id });
    }
  }

  return processed;
}
