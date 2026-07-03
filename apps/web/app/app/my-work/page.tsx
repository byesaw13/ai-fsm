import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { isSameCalendarDay } from "@/lib/visits/formatting";
import { pickHeroVisit, type HeroVisit } from "@/lib/my-day/visit-hero";
import { loadFieldDayData } from "@/lib/my-work/field-day-data";
import { MyDayMobileLayout } from "../my-day/MyDayMobileLayout";
import { ManualSiteVisitButton } from "../ManualSiteVisitButton";
import { LocationCaptureControl } from "../LocationCaptureControl";
import {
  OPERATIONAL_VISIT_TYPES,
  WORK_ORDER_STATUS_LABELS,
  VISIT_TYPE_LABELS,
  type WorkOrderStatus,
  type VisitType,
} from "@ai-fsm/domain";
import { PageContainer, PageHeader, Card, SectionHeader, EmptyState, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

type WoCard = {
  id: string;
  title: string;
  status: string;
  client_name: string | null;
  property_address: string | null;
  next_scheduled: string | null;
  active_visit_id: string | null;
};

type AssessmentCard = {
  id: string;
  visit_type: string;
  scheduled_start: string;
  status: string;
  client_name: string | null;
  job_title: string | null;
};

export default async function MyWorkPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "admin") redirect("/app");

  const isTech = session.role === "tech";
  const isOwner = session.role === "owner";
  const opTypes = [...OPERATIONAL_VISIT_TYPES];
  const now = new Date();

  const [fieldDay, workOrders, assessments, heroVisits] = await Promise.all([
    loadFieldDayData(session, isOwner),
    queryForSession<WoCard>(
      session,
      `SELECT w.id, w.title, w.status, c.name AS client_name, p.address AS property_address,
              (SELECT MIN(v.scheduled_start)::text FROM visits v
               WHERE v.work_order_id = w.id AND v.status = 'scheduled' AND v.scheduled_start > now()) AS next_scheduled,
              (SELECT v.id::text FROM visits v
               WHERE v.work_order_id = w.id AND v.assigned_user_id = $2
                 AND v.status IN ('dispatched','traveling','arrived','in_progress','waiting')
               LIMIT 1) AS active_visit_id
       FROM work_orders w
       JOIN jobs j ON j.id = w.job_id
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       WHERE w.account_id = $1 AND w.assigned_user_id = $2
         AND w.status NOT IN ('draft','completed','cancelled')
       ORDER BY
         CASE w.status WHEN 'dispatched' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
         next_scheduled NULLS LAST,
         w.updated_at DESC`,
      [session.accountId, session.userId],
    ),
    queryForSession<AssessmentCard>(
      session,
      `SELECT v.id, v.visit_type, v.scheduled_start::text, v.status,
              c.name AS client_name, j.title AS job_title
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN clients c ON c.id = j.client_id
       WHERE v.account_id = $1 AND v.assigned_user_id = $2
         AND v.work_order_id IS NULL
         AND v.visit_type = ANY($3::text[])
         AND v.status NOT IN ('completed','cancelled')
       ORDER BY v.scheduled_start ASC
       LIMIT 50`,
      [session.accountId, session.userId, opTypes],
    ),
    queryForSession<HeroVisit>(
      session,
      `SELECT v.id, v.status, v.scheduled_start::text, j.title AS job_title,
              p.address AS property_address, c.name AS client_name, c.phone AS client_phone
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       WHERE v.account_id = $1 AND v.assigned_user_id = $2
         AND v.status NOT IN ('completed','cancelled')
       ORDER BY v.scheduled_start ASC
       LIMIT 100`,
      [session.accountId, session.userId],
    ),
  ]);

  const todayVisits = heroVisits.filter((v) => isSameCalendarDay(v.scheduled_start));
  const heroVisit = pickHeroVisit(todayVisits, now.getTime());

  const nowHour = now.getHours();
  const greeting =
    nowHour < 12 ? "Good morning" : nowHour < 17 ? "Good afternoon" : "Good evening";

  let statusLabel = `${workOrders.length} work order${workOrders.length !== 1 ? "s" : ""}`;
  if (heroVisit?.status === "in_progress" || heroVisit?.status === "arrived") {
    statusLabel += " · In progress now";
  } else if (heroVisit) {
    const d = new Date(heroVisit.scheduled_start);
    statusLabel += ` · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()} next`;
  }

  return (
    <PageContainer>
      <PageHeader
        title="My Work"
        subtitle={`${greeting} — ${statusLabel}`}
        actions={
          isTech ? (
            <LinkButton href="/app/visits" variant="secondary" size="sm">
              Visits →
            </LinkButton>
          ) : (
            <span style={{ display: "inline-flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <ManualSiteVisitButton />
              <span className="p7-only-desktop">
                <LinkButton href="/app" variant="secondary" size="sm">
                  ← Dashboard
                </LinkButton>
              </span>
            </span>
          )
        }
      />

      {fieldDay.locationSettings && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <LocationCaptureControl
            enabled={fieldDay.locationSettings.enabled}
            pausedUntil={fieldDay.locationSettings.pausedUntil}
            hasActiveWorkday={!!fieldDay.openSession}
          />
        </div>
      )}

      {fieldDay.ownerPeek && (
        <Link
          href={"/app/action-queue" as Route}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            marginBottom: "var(--space-4)",
            padding: "var(--space-2) var(--space-3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-card)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-sm)" }}>
              <strong style={{ color: "var(--color-red-600)" }}>
                ${(fieldDay.ownerPeek.outstandingCents / 100).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </strong>
              <span style={{ color: "var(--fg-muted)" }}> outstanding</span>
            </span>
            <span style={{ fontSize: "var(--text-sm)" }}>
              <strong>{fieldDay.ownerPeek.draftInvoices}</strong>
              <span style={{ color: "var(--fg-muted)" }}>
                {" "}
                draft invoice{fieldDay.ownerPeek.draftInvoices !== 1 ? "s" : ""} to review
              </span>
            </span>
          </div>
          <span
            style={{
              color: "var(--accent)",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            Office →
          </span>
        </Link>
      )}

      <MyDayMobileLayout
        openSession={fieldDay.openSession}
        vehicles={fieldDay.vehicles}
        activityEntries={fieldDay.activityEntries}
        dayMileage={fieldDay.dayMileage}
        heroVisit={heroVisit}
        clockedIn={fieldDay.clockedIn}
      >
        <Card style={{ marginBottom: "var(--space-4)" }}>
          <SectionHeader title="Active Work Orders" count={workOrders.length} />
          {workOrders.length === 0 ? (
            <EmptyState
              title="No work orders assigned"
              description="When you're the lead on a work order, it appears here. Start your day above to clock in and log mileage."
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {workOrders.map((wo) => {
                const status =
                  WORK_ORDER_STATUS_LABELS[wo.status as WorkOrderStatus] ?? wo.status;
                const derived = wo.active_visit_id ? " · In progress" : "";
                return (
                  <li key={wo.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <Link
                      href={`/app/my-work/${wo.id}` as Route}
                      style={{
                        display: "block",
                        padding: "var(--space-3) 0",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <strong>{wo.client_name ?? "Client"}</strong>
                      <div>{wo.title}</div>
                      <small style={{ color: "var(--fg-muted)" }}>
                        {status}
                        {derived}
                        {wo.next_scheduled &&
                          ` · Next ${new Date(wo.next_scheduled).toLocaleString([], {
                            weekday: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`}
                      </small>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {assessments.length > 0 && (
          <Card>
            <SectionHeader title="Assessments" count={assessments.length} />
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {assessments.map((v) => (
                <li key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <Link
                    href={`/app/visits/${v.id}` as Route}
                    style={{
                      display: "block",
                      padding: "var(--space-3) 0",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <strong>{v.client_name ?? v.job_title ?? "Assessment"}</strong>
                    <div>
                      {VISIT_TYPE_LABELS[v.visit_type as VisitType] ?? v.visit_type}
                    </div>
                    <small style={{ color: "var(--fg-muted)" }}>
                      {new Date(v.scheduled_start).toLocaleString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </MyDayMobileLayout>
    </PageContainer>
  );
}