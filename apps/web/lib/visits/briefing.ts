import type { PoolClient } from "pg";

export type VisitBriefing = {
  previousNotes: string | null;
  previousAssigneeName: string | null;
  priorNotes: Array<{ date: string; notes: string }>;
  firstUp: string | null;
  scheduledStart: string | null;
};

export async function loadVisitBriefing(
  client: PoolClient,
  accountId: string,
  visitId: string,
): Promise<VisitBriefing | null> {
  const current = await client.query<{
    job_id: string | null;
    scheduled_start: string;
  }>(
    `SELECT job_id, scheduled_start::text
     FROM visits WHERE id = $1 AND account_id = $2`,
    [visitId, accountId],
  );
  const visit = current.rows[0];
  if (!visit?.job_id) return null;

  const prior = await client.query<{
    tech_notes: string | null;
    scheduled_start: string;
    assignee: string | null;
  }>(
    `SELECT v.tech_notes, v.scheduled_start::text,
            u.full_name AS assignee
     FROM visits v
     LEFT JOIN users u ON u.id = v.assigned_user_id
     WHERE v.job_id = $1 AND v.account_id = $2
       AND v.status = 'completed'
       AND v.visit_type IS DISTINCT FROM 'site_visit'
     ORDER BY v.scheduled_start ASC`,
    [visit.job_id, accountId],
  );

  const last = prior.rows[prior.rows.length - 1] ?? null;
  const priorNotes = prior.rows
    .filter((r) => (r.tech_notes ?? "").trim())
    .map((r) => ({
      date: r.scheduled_start,
      notes: (r.tech_notes ?? "").trim(),
    }));

  const firstUp = await client.query<{ label: string }>(
    `SELECT t.label
     FROM visit_tasks vt
     JOIN work_order_tasks t ON t.id = vt.task_id
     WHERE vt.visit_id = $1 AND vt.account_id = $2
       AND t.completed = false AND t.status <> 'done'
     ORDER BY t.sort_order ASC
     LIMIT 1`,
    [visitId, accountId],
  );

  if (!last && !firstUp.rows[0] && priorNotes.length === 0) {
    return {
      previousNotes: null,
      previousAssigneeName: null,
      priorNotes: [],
      firstUp: null,
      scheduledStart: visit.scheduled_start,
    };
  }

  return {
    previousNotes: last?.tech_notes?.trim() || null,
    previousAssigneeName: last?.assignee ?? null,
    priorNotes,
    firstUp: firstUp.rows[0]?.label ?? null,
    scheduledStart: visit.scheduled_start,
  };
}
