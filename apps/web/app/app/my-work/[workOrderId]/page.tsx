import type { Route } from "next";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import {
  WORK_ORDER_STATUS_LABELS,
  allRequiredCriteriaMet,
  type CompletionCriterion,
  type WorkOrderStatus,
} from "@ai-fsm/domain";
import { PageContainer, PageHeader, Card, SectionHeader, LinkButton, Timeline } from "@/components/ui";
import { fetchWorkOrderTimeline } from "@/lib/work-orders/timeline";
import { FieldWorkActions } from "../FieldWorkActions";
import { FieldCloseout } from "../FieldCloseout";
import { DailyRecapPanel } from "../../field/DailyRecapPanel";

export const dynamic = "force-dynamic";

type WoRow = {
  id: string;
  title: string;
  status: string;
  scope: string | null;
  completion_criteria: unknown;
  client_name: string | null;
  property_address: string | null;
  job_id: string;
  job_title: string | null;
};

export default async function MyWorkOrderPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  const { workOrderId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "admin") redirect("/app");

  const rows = await queryForSession<WoRow>(
    session,
    `SELECT w.id, w.title, w.status, w.scope, w.completion_criteria, j.id AS job_id,
            c.name AS client_name, p.address AS property_address, j.title AS job_title
     FROM work_orders w
     JOIN jobs j ON j.id = w.job_id
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN properties p ON p.id = j.property_id
     WHERE w.id = $1 AND w.account_id = $2 AND w.assigned_user_id = $3`,
    [workOrderId, session.accountId, session.userId],
  );
  const wo = rows[0];
  if (!wo) notFound();

  const [activeVisit, nextVisit, timeline, criteria] = await Promise.all([
    queryForSession<{ id: string }>(
      session,
      `SELECT id FROM visits
       WHERE work_order_id = $1 AND account_id = $2 AND assigned_user_id = $3
         AND status IN ('dispatched','traveling','arrived','in_progress','waiting')
       LIMIT 1`,
      [workOrderId, session.accountId, session.userId],
    ),
    queryForSession<{ scheduled_start: string }>(
      session,
      `SELECT scheduled_start FROM visits
       WHERE work_order_id = $1 AND account_id = $2 AND status = 'scheduled'
         AND scheduled_start > now()
       ORDER BY scheduled_start ASC LIMIT 1`,
      [workOrderId, session.accountId],
    ),
    fetchWorkOrderTimeline(session, workOrderId),
    Promise.resolve(
      Array.isArray(wo.completion_criteria)
        ? (wo.completion_criteria as CompletionCriterion[])
        : [],
    ),
  ]);

  const outstanding = criteria.filter((c) => c.required && !c.completed).length;
  const statusLabel = WORK_ORDER_STATUS_LABELS[wo.status as WorkOrderStatus] ?? wo.status;

  return (
    <PageContainer>
      <PageHeader
        title={wo.title}
        subtitle={[wo.client_name, wo.property_address].filter(Boolean).join(" · ") || undefined}
        backHref="/app/my-work"
        backLabel="My Work"
      />

      <Card style={{ marginBottom: "var(--space-4)" }}>
        <dl className="p7-detail-list">
          <div className="p7-detail-row">
            <dt>Status</dt>
            <dd>{statusLabel}</dd>
          </div>
          {wo.scope && (
            <div className="p7-detail-row">
              <dt>Scope</dt>
              <dd>{wo.scope}</dd>
            </div>
          )}
          {nextVisit[0] && (
            <div className="p7-detail-row">
              <dt>Next appointment</dt>
              <dd>
                {new Date(nextVisit[0].scheduled_start).toLocaleString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          )}
          {criteria.length > 0 && (
            <div className="p7-detail-row">
              <dt>Checklist</dt>
              <dd>
                {allRequiredCriteriaMet(criteria)
                  ? "All required items done"
                  : `${outstanding} item${outstanding !== 1 ? "s" : ""} remaining`}
              </dd>
            </div>
          )}
        </dl>
        <div style={{ marginTop: "var(--space-3)" }}>
          <FieldWorkActions
            workOrderId={workOrderId}
            activeVisitId={activeVisit[0]?.id ?? null}
          />
        </div>
        <FieldCloseout
          workOrderId={workOrderId}
          initialCriteria={criteria}
          woStatus={wo.status}
          hasActiveVisit={!!activeVisit[0]}
        />
      </Card>

      <DailyRecapPanel jobId={wo.job_id} />

      <Card>
        <SectionHeader title="Timeline" count={timeline.length} />
        <Timeline entries={timeline} emptyMessage="No activity yet." />
        <div style={{ marginTop: "var(--space-3)" }}>
          <LinkButton href={`/app/jobs/${wo.job_id}` as Route} variant="ghost" size="sm">
            Project hub →
          </LinkButton>
        </div>
      </Card>
    </PageContainer>
  );
}