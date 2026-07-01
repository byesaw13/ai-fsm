import type { SessionPayload } from "@/lib/auth/session";
import type { TimelineEntryData } from "@/components/ui";
import { queryForSession } from "@/lib/db";

type VisitRow = {
  id: string;
  scheduled_start: string;
  arrived_at: string | null;
  completed_at: string | null;
  status: string;
  tech_notes: string | null;
};

/** ponytail: compose from existing tables; no work_order_timeline_events table */
export function buildWorkOrderTimeline(input: {
  woCreatedAt: string;
  woCompletedAt: string | null;
  estimateAcceptedAt: string | null;
  visits: VisitRow[];
  reminders: Array<{ visit_id: string; created_at: string }>;
  workflowEvents: Array<{ id: string; event_type: string; created_at: string; entity_id: string }>;
}): TimelineEntryData[] {
  const entries: TimelineEntryData[] = [];

  if (input.estimateAcceptedAt) {
    entries.push({
      id: "estimate-accepted",
      timestamp: input.estimateAcceptedAt,
      title: "Estimate accepted",
      isCompleted: true,
    });
  }

  entries.push({
    id: "wo-created",
    timestamp: input.woCreatedAt,
    title: "Work order created",
  });

  const visits = [...input.visits].sort(
    (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
  );

  visits.forEach((v, idx) => {
    const n = idx + 1;
    entries.push({
      id: `${v.id}-scheduled`,
      timestamp: v.scheduled_start,
      title: `Visit #${n} scheduled`,
      status: v.status,
      href: `/app/visits/${v.id}`,
      isCompleted: v.status === "completed" || v.status === "cancelled",
    });

    const reminder = input.reminders.find((r) => r.visit_id === v.id);
    if (reminder) {
      entries.push({
        id: `${v.id}-reminder`,
        timestamp: reminder.created_at,
        title: "Appointment reminder sent",
      });
    }

    if (v.arrived_at) {
      entries.push({
        id: `${v.id}-started`,
        timestamp: v.arrived_at,
        title: `Visit #${n} started`,
        href: `/app/visits/${v.id}`,
        status: "in_progress",
      });
    }

    if (v.completed_at) {
      const note = v.tech_notes?.trim();
      entries.push({
        id: `${v.id}-log`,
        timestamp: v.completed_at,
        title: `Visit #${n}`,
        subtitle: note || "Day log closed",
        href: `/app/visits/${v.id}`,
        status: "completed",
        isCompleted: true,
      });
    } else {
      const wf = input.workflowEvents.find(
        (e) => e.entity_id === v.id && e.event_type === "visit.completed",
      );
      if (wf) {
        entries.push({
          id: wf.id,
          timestamp: wf.created_at,
          title: `Visit #${n} completed`,
          href: `/app/visits/${v.id}`,
          status: "completed",
          isCompleted: true,
        });
      }
    }
  });

  if (input.woCompletedAt) {
    entries.push({
      id: "wo-completed",
      timestamp: input.woCompletedAt,
      title: "Work order completed",
      status: "completed",
      isCompleted: true,
    });
  }

  return entries.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export async function fetchWorkOrderTimeline(
  session: SessionPayload,
  workOrderId: string,
): Promise<TimelineEntryData[]> {
  const woRows = await queryForSession<{
    created_at: string;
    completed_at: string | null;
    source_estimate_id: string | null;
  }>(
    session,
    `SELECT created_at::text, completed_at::text, source_estimate_id
     FROM work_orders WHERE id = $1 AND account_id = $2`,
    [workOrderId, session.accountId],
  );
  const wo = woRows[0];
  if (!wo) return [];

  const visits = await queryForSession<VisitRow>(
    session,
    `SELECT id, scheduled_start::text, arrived_at::text, completed_at::text,
            status, tech_notes
     FROM visits WHERE work_order_id = $1 AND account_id = $2
     ORDER BY scheduled_start ASC`,
    [workOrderId, session.accountId],
  );

  const visitIds = visits.map((v) => v.id);

  const [estimateRows, reminders, workflowEvents] = await Promise.all([
    wo.source_estimate_id
      ? queryForSession<{ updated_at: string }>(
          session,
          `SELECT updated_at::text FROM estimates
           WHERE id = $1 AND account_id = $2 AND status = 'approved'`,
          [wo.source_estimate_id, session.accountId],
        )
      : Promise.resolve([]),
    visitIds.length > 0
      ? queryForSession<{ visit_id: string; created_at: string }>(
          session,
          `SELECT entity_id::text AS visit_id, created_at::text
           FROM audit_log
           WHERE account_id = $1 AND entity_type = 'visit_reminder'
             AND entity_id = ANY($2::uuid[])
           ORDER BY created_at ASC`,
          [session.accountId, visitIds],
        )
      : Promise.resolve([]),
    visitIds.length > 0
      ? queryForSession<{ id: string; event_type: string; created_at: string; entity_id: string }>(
          session,
          `SELECT id::text, event_type, created_at::text, entity_id::text
           FROM workflow_events
           WHERE account_id = $1 AND entity_type = 'visit'
             AND entity_id = ANY($2::uuid[])
             AND event_type IN ('visit.completed', 'visit.cancelled')
           ORDER BY created_at ASC`,
          [session.accountId, visitIds],
        )
      : Promise.resolve([]),
  ]);

  return buildWorkOrderTimeline({
    woCreatedAt: wo.created_at,
    woCompletedAt: wo.completed_at,
    estimateAcceptedAt: estimateRows[0]?.updated_at ?? null,
    visits,
    reminders: reminders,
    workflowEvents,
  });
}