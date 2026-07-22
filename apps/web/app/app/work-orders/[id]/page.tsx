import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates, canCreateVisit } from "@/lib/auth/permissions";
import { getPool, queryForSession } from "@/lib/db";
import {
  WORK_ORDER_UI_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderRoomLine,
  type CompletionCriterion,
} from "@ai-fsm/domain";
import {
  PageContainer,
  PageHeader,
  Card,
  SectionHeader,
  Timeline,
  LinkButton,
  StatusBadge,
} from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { fetchWorkOrderTimeline } from "@/lib/work-orders/timeline";
import { loadWorkOrderCompletionCriteria } from "@/lib/work-orders/task-time";
import { WorkOrderForm, type MaterialRow } from "../WorkOrderForm";

export const dynamic = "force-dynamic";

type WorkOrderRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  property_id: string | null;
  property_address: string | null;
  job_id: string | null;
  job_title: string | null;
  job_number: string | null;
  title: string;
  scope: string | null;
  site_notes: string | null;
  safety_notes: string | null;
  rooms: unknown;
  status: string;
  total_cents: number;
  completed_at: string | null;
  source_visit_id: string | null;
  source_assessment_id: string | null;
  completion_criteria: unknown;
};

type MaterialDbRow = {
  description: string;
  quantity: number | string;
  unit_price_cents: number;
  total_cents: number;
};

type VisitRow = {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  tech_name: string | null;
};

const STATUSES = WORK_ORDER_UI_STATUSES;

function hoursBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function formatVisitWhen(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const day = s.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t0 = s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const t1 = e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t0} – ${t1}`;
}

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateEstimates(session.role)) redirect("/app/work-orders");

  const rows = await queryForSession<WorkOrderRow>(
    session,
    `SELECT w.id, w.client_id, c.name AS client_name, w.property_id, p.address AS property_address,
            w.job_id, j.title AS job_title, j.job_number,
            w.title, w.scope, w.site_notes, w.safety_notes, w.rooms, w.status,
            w.total_cents, w.completed_at::text, w.source_visit_id, w.source_assessment_id,
            w.completion_criteria
     FROM work_orders w
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN properties p ON p.id = w.property_id
     LEFT JOIN jobs j ON j.id = w.job_id
     WHERE w.id = $1 AND w.account_id = $2`,
    [id, session.accountId],
  );
  const wo = rows[0];
  if (!wo) notFound();

  const matRows = await queryForSession<MaterialDbRow>(
    session,
    `SELECT description, quantity, unit_price_cents, total_cents
     FROM work_order_materials WHERE work_order_id = $1 ORDER BY sort_order ASC`,
    [id],
  );
  const materials: MaterialRow[] = matRows.map((m) => ({
    description: m.description,
    quantity: Number(m.quantity),
    unit_price_cents: m.unit_price_cents,
    total_cents: m.total_cents,
  }));

  const visits = await queryForSession<VisitRow>(
    session,
    `SELECT v.id, v.status, v.scheduled_start::text, v.scheduled_end::text,
            u.full_name AS tech_name
     FROM visits v
     LEFT JOIN users u ON u.id = v.assigned_user_id
     WHERE v.work_order_id = $1 AND v.account_id = $2
     ORDER BY v.scheduled_start ASC`,
    [id, session.accountId],
  );

  const rooms: WorkOrderRoomLine[] = Array.isArray(wo.rooms)
    ? (wo.rooms as WorkOrderRoomLine[])
    : [];
  const status = (STATUSES as readonly string[]).includes(wo.status)
    ? (wo.status as (typeof STATUSES)[number])
    : "draft";

  // Slice 1b: tasks are checklist source of truth (same as My Work closeout).
  const pool = getPool();
  const client = await pool.connect();
  let completionCriteria: CompletionCriterion[] = [];
  try {
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );
    completionCriteria = await loadWorkOrderCompletionCriteria(
      client,
      id,
      session.accountId,
      wo.completion_criteria,
    );
  } finally {
    client.release();
  }

  const timeline = await fetchWorkOrderTimeline(session, id);
  const canSchedule = canCreateVisit(session.role) && !!wo.job_id && wo.status !== "cancelled" && wo.status !== "completed";

  const openVisits = visits.filter((v) => !["completed", "cancelled"].includes(v.status));
  const completedVisits = visits.filter((v) => v.status === "completed");
  const plannedHours = visits
    .filter((v) => v.status !== "cancelled")
    .reduce((sum, v) => sum + hoursBetween(v.scheduled_start, v.scheduled_end), 0);
  const completedHours = completedVisits.reduce(
    (sum, v) => sum + hoursBetween(v.scheduled_start, v.scheduled_end),
    0,
  );

  const scheduleBase = wo.job_id
    ? `/app/jobs/${wo.job_id}/visits/new?work_order_id=${wo.id}`
    : null;

  return (
    <PageContainer>
      <PageHeader
        title={wo.title}
        subtitle={`${WORK_ORDER_STATUS_LABELS[wo.status as keyof typeof WORK_ORDER_STATUS_LABELS] ?? wo.status}${wo.completed_at ? " · completed" : ""}${wo.client_name ? ` · ${wo.client_name}` : ""}`}
        backHref="/app/work-orders"
        backLabel="Work Orders"
        actions={
          canSchedule && scheduleBase ? (
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <LinkButton href={scheduleBase} variant="primary" data-testid="wo-schedule-visit">
                Schedule Visit
              </LinkButton>
              <LinkButton
                href={`${scheduleBase}&multi=1`}
                variant="secondary"
                data-testid="wo-schedule-multi"
              >
                Multiple Days
              </LinkButton>
            </div>
          ) : undefined
        }
      />

      {/* Schedule & field days — visits are the calendar truth */}
      <Card style={{ marginBottom: "var(--space-4)" }} data-testid="wo-field-days-panel">
        <SectionHeader title="Schedule & field days" count={visits.length} />
        <p className="muted" style={{ marginTop: 0, fontSize: "var(--text-sm)" }}>
          This work order holds <strong>scope</strong>. Each <strong>visit</strong> is one field day
          (hours on the calendar). Multi-day jobs use multiple visits under this same work order.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-4)",
            marginBottom: "var(--space-3)",
            padding: "12px 14px",
            background: "var(--bg-subtle, #fafaf9)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", letterSpacing: "0.04em" }}>
              DAYS SCHEDULED
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
              {openVisits.length + completedVisits.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", letterSpacing: "0.04em" }}>
              PLANNED HOURS
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
              {plannedHours}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-muted)", letterSpacing: "0.04em" }}>
              DAYS COMPLETED
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
              {completedVisits.length}
              {completedHours > 0 ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-muted)", marginLeft: 6 }}>
                  ({completedHours} hrs calendar)
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {!wo.job_id && (
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Link this work order to a project before scheduling visits.
          </p>
        )}

        {canSchedule && scheduleBase && (
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
            <LinkButton href={scheduleBase} variant="primary" data-testid="wo-schedule-visit-panel">
              Schedule Visit
            </LinkButton>
            <LinkButton href={`${scheduleBase}&multi=1`} variant="secondary">
              Schedule multiple days
            </LinkButton>
            {wo.job_id && (
              <Link
                href={`/app/jobs/${wo.job_id}`}
                style={{ fontSize: "var(--text-sm)", alignSelf: "center", color: "var(--accent)" }}
              >
                Open project{wo.job_number ? ` ${wo.job_number}` : ""} →
              </Link>
            )}
          </div>
        )}

        {visits.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }} data-testid="wo-no-visits">
            No field days scheduled yet. Book the first visit to put this work on the calendar.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }} data-testid="wo-visit-list">
            {visits.map((v) => (
              <li
                key={v.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderTop: "1px solid var(--border)",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <Link
                    href={`/app/visits/${v.id}`}
                    style={{ fontWeight: 600, color: "var(--fg)", textDecoration: "none" }}
                  >
                    {formatVisitWhen(v.scheduled_start, v.scheduled_end)}
                  </Link>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                    {hoursBetween(v.scheduled_start, v.scheduled_end)} hrs
                    {v.tech_name ? ` · ${v.tech_name}` : " · Unassigned"}
                  </div>
                </div>
                <StatusBadge variant={v.status as StatusVariant}>{v.status.replace(/_/g, " ")}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {timeline.length > 0 && (
        <Card style={{ marginBottom: "var(--space-4)" }}>
          <SectionHeader title="Timeline" count={timeline.length} />
          <Timeline entries={timeline} />
        </Card>
      )}
      <Card>
        <WorkOrderForm
          mode="edit"
          workOrderId={wo.id}
          clientId={wo.client_id}
          clientName={wo.client_name}
          propertyId={wo.property_id}
          propertyAddress={wo.property_address}
          jobId={wo.job_id}
          sourceVisitId={wo.source_visit_id}
          sourceAssessmentId={wo.source_assessment_id}
          initial={{
            title: wo.title,
            scope: wo.scope ?? "",
            siteNotes: wo.site_notes ?? "",
            safetyNotes: wo.safety_notes ?? "",
            rooms,
            materials,
            status,
            completionCriteria,
          }}
        />
      </Card>
    </PageContainer>
  );
}
