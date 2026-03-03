import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canViewAllVisits } from "@/lib/auth/permissions";
import {
  formatOverdueLabel,
  formatVisitDateTime,
  isSameCalendarDay,
  isVisitOverdue,
} from "@/lib/visits/p7";
import type { Visit, VisitStatus } from "@ai-fsm/domain";
import {
  PageContainer,
  PageHeader,
  ItemCard,
  StatusSection,
  EmptyState,
  StatusBadge,
  MetricGrid,
  Timeline,
  SectionHeader,
} from "@/components/ui";
import type {
  StatusVariant,
  MetricCardData,
  TimelineEntryData,
} from "@/components/ui";

export const dynamic = "force-dynamic";

type VisitRow = Visit & {
  job_title: string | null;
  assigned_user_name: string | null;
  client_name: string | null;
  property_address: string | null;
};

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "Scheduled",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_ORDER: VisitStatus[] = [
  "in_progress",
  "arrived",
  "scheduled",
  "completed",
  "cancelled",
];

interface VisitCardProps {
  visit: VisitRow;
  showTech?: boolean;
  showOverdue?: boolean;
}

function VisitItemCard({ visit, showTech = false, showOverdue = false }: VisitCardProps) {
  const overdue = isVisitOverdue(visit);
  const metaParts: ReactNode[] = [];

  metaParts.push(
    <span key="date" className="p7-item-meta-text">
      {formatVisitDateTime(visit.scheduled_start)}
    </span>
  );

  if (visit.property_address) {
    metaParts.push(
      <span key="addr" className="p7-item-meta-text">
        {visit.property_address}
      </span>
    );
  }

  if (showTech) {
    if (visit.assigned_user_name) {
      metaParts.push(
        <span key="tech" className="p7-item-meta-text">
          Tech: {visit.assigned_user_name}
        </span>
      );
    } else {
      metaParts.push(
        <span
          key="unassigned"
          className="p7-badge p7-badge-status-cancelled"
          data-testid="unassigned-badge"
        >
          Unassigned
        </span>
      );
    }
  }

  if (showOverdue && overdue) {
    metaParts.push(
      <span key="overdue" className="p7-badge p7-badge-status-overdue">
        {formatOverdueLabel(visit.scheduled_start)}
      </span>
    );
  }

  return (
    <ItemCard
      href={`/app/visits/${visit.id}`}
      title={visit.job_title ?? "Untitled job"}
      titleBadge={
        <StatusBadge variant={visit.status as StatusVariant}>
          {VISIT_STATUS_LABELS[visit.status as VisitStatus]}
        </StatusBadge>
      }
      meta={metaParts.length > 0 ? <>{metaParts}</> : undefined}
      overdue={overdue}
      data-testid="visit-card"
    />
  );
}

export default async function VisitsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllVisits(session.role);
  const isTech = session.role === "tech";

  let visits: VisitRow[];
  if (isAdmin) {
    visits = await query<VisitRow>(
      `SELECT
          v.*,
          j.title AS job_title,
          u.full_name AS assigned_user_name,
          c.name AS client_name,
          p.address AS property_address
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN users u ON u.id = v.assigned_user_id
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       WHERE v.account_id = $1
       ORDER BY v.scheduled_start ASC
       LIMIT 200`,
      [session.accountId]
    );
  } else {
    visits = await query<VisitRow>(
      `SELECT
          v.*,
          j.title AS job_title,
          u.full_name AS assigned_user_name,
          c.name AS client_name,
          p.address AS property_address
       FROM visits v
       LEFT JOIN jobs j ON j.id = v.job_id
       LEFT JOIN users u ON u.id = v.assigned_user_id
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       WHERE v.account_id = $1 AND v.assigned_user_id = $2
       ORDER BY v.scheduled_start ASC
       LIMIT 200`,
      [session.accountId, session.userId]
    );
  }

  const now = new Date();
  const currentHour = now.getHours();
  const timeGreeting =
    currentHour < 12
      ? "Good morning"
      : currentHour < 17
      ? "Good afternoon"
      : "Good evening";

  const todayVisits = visits.filter((v) => isSameCalendarDay(v.scheduled_start));
  const overdueVisits = visits.filter(isVisitOverdue);
  const unassigned = visits.filter(
    (v) =>
      !v.assigned_user_id &&
      v.status !== "completed" &&
      v.status !== "cancelled"
  );
  const activeVisits = visits.filter(
    (v) => v.status === "in_progress" || v.status === "arrived"
  );

  // Group all visits by status for status-section breakdown
  const grouped = STATUS_ORDER.reduce<Record<string, VisitRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );
  for (const visit of visits) {
    grouped[visit.status]?.push(visit);
  }
  const activeStatuses = STATUS_ORDER.filter((s) => grouped[s].length > 0);

  // Tech "My Day" timeline entries
  const techTodayEntries: TimelineEntryData[] = todayVisits.map((v) => ({
    id: v.id,
    timestamp: v.scheduled_start,
    title: v.job_title ?? "Untitled job",
    subtitle: v.property_address ?? undefined,
    status: v.status,
    badge: isVisitOverdue(v) ? (
      <span className="p7-badge p7-badge-status-overdue">
        {formatOverdueLabel(v.scheduled_start)}
      </span>
    ) : undefined,
    href: `/app/visits/${v.id}`,
    isCompleted: v.status === "completed" || v.status === "cancelled",
  }));

  // Tech upcoming = scheduled visits not today
  const techUpcoming = visits.filter(
    (v) => !isSameCalendarDay(v.scheduled_start) && v.status === "scheduled"
  );

  // Admin metrics
  const adminMetrics: MetricCardData[] = [
    { label: "Needs Assignment", value: unassigned.length },
    { label: "Today", value: todayVisits.length },
    { label: "Active Now", value: activeVisits.length },
    {
      label: "Overdue",
      value: overdueVisits.length,
      variant: overdueVisits.length > 0 ? "alert" : "default",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Visits"
        subtitle={
          isTech
            ? `${timeGreeting} — ${todayVisits.length} visit${
                todayVisits.length !== 1 ? "s" : ""
              } today`
            : `${visits.length} total`
        }
      />

      {/* Admin: metrics summary */}
      {isAdmin && <MetricGrid metrics={adminMetrics} />}

      {/* Admin: overdue alert section */}
      {isAdmin && overdueVisits.length > 0 && (
        <StatusSection title="Overdue" count={overdueVisits.length}>
          {overdueVisits.map((v) => (
            <VisitItemCard key={v.id} visit={v} showTech showOverdue />
          ))}
        </StatusSection>
      )}

      {/* Admin: unassigned section */}
      {isAdmin && unassigned.length > 0 && (
        <StatusSection title="Needs Assignment" count={unassigned.length}>
          {unassigned.map((v) => (
            <VisitItemCard key={v.id} visit={v} />
          ))}
        </StatusSection>
      )}

      {/* Tech: My Day timeline */}
      {isTech && (
        <>
          <SectionHeader
            title={`Today — ${todayVisits.length} visit${
              todayVisits.length !== 1 ? "s" : ""
            }`}
          />
          {todayVisits.length === 0 ? (
            <EmptyState
              title="No visits today"
              description="Your schedule is clear for today."
            />
          ) : (
            <Timeline
              entries={techTodayEntries}
              emptyMessage="No visits today."
            />
          )}

          {techUpcoming.length > 0 && (
            <StatusSection title="Upcoming" count={techUpcoming.length}>
              {techUpcoming.map((v) => (
                <VisitItemCard key={v.id} visit={v} />
              ))}
            </StatusSection>
          )}
        </>
      )}

      {/* All visits by status — shows complete list */}
      {visits.length === 0 ? (
        <EmptyState
          title={isAdmin ? "No visits scheduled" : "No visits assigned"}
          description={
            isAdmin
              ? "Schedule visits from job detail pages."
              : "Visits will appear here when you're assigned."
          }
          data-testid="visits-empty"
        />
      ) : (
        activeStatuses.map((status) => (
          <StatusSection
            key={status}
            title={VISIT_STATUS_LABELS[status as VisitStatus]}
            count={grouped[status].length}
          >
            {grouped[status].map((v) => (
              <VisitItemCard
                key={v.id}
                visit={v}
                showTech={isAdmin}
                showOverdue
              />
            ))}
          </StatusSection>
        ))
      )}
    </PageContainer>
  );
}
