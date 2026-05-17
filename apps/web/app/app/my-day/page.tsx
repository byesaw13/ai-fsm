import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { isSameCalendarDay, isVisitOverdue, formatOverdueLabel } from "@/lib/visits/p7";
import { canViewAllVisits } from "@/lib/auth/permissions";
import { MyDayView } from "./MyDayView";
import { PageContainer, PageHeader, EmptyState, LinkButton } from "@/components/ui";
import type { Visit, VisitStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

type VisitRow = Visit & {
  job_title: string | null;
  assigned_user_name: string | null;
  client_name: string | null;
  property_address: string | null;
  job_type: string | null;
  job_description: string | null;
};

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "Scheduled",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function MyDayPage() {
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
          j.job_type AS job_type,
          j.description AS job_description,
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
          j.job_type AS job_type,
          j.description AS job_description,
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
  const todayVisits = visits.filter((v) => isSameCalendarDay(v.scheduled_start));
  // Past-day overdue: scheduled visits whose date was before today (not just past the hour)
  const pastOverdueVisits = visits.filter(
    (v) =>
      !isSameCalendarDay(v.scheduled_start) &&
      isVisitOverdue(v) &&
      v.status !== "completed" &&
      v.status !== "cancelled"
  );
  const upcomingVisits = visits.filter(
    (v) =>
      !isSameCalendarDay(v.scheduled_start) &&
      !isVisitOverdue(v) &&
      v.status !== "completed" &&
      v.status !== "cancelled"
  );

  const activeVisit = todayVisits.find(
    (v) => v.status === "in_progress" || v.status === "arrived"
  );
  const nextVisit = todayVisits.find(
    (v) => v.status === "scheduled" && !isVisitOverdue(v)
  );

  const completedToday = todayVisits.filter(
    (v) => v.status === "completed" || v.status === "cancelled"
  );
  const pendingToday = todayVisits.filter(
    (v) => v.status !== "completed" && v.status !== "cancelled"
  );
  const overdueVisits = todayVisits.filter(isVisitOverdue);

  const nowISO = now.toISOString();
  const nowHour = now.getHours();
  const greeting =
    nowHour < 12 ? "Good morning" : nowHour < 17 ? "Good afternoon" : "Good evening";

  let nextTimeLabel = "No visits today";
  if (nextVisit) {
    const d = new Date(nextVisit.scheduled_start);
    nextTimeLabel = `${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()} next`;
  } else if (activeVisit) {
    nextTimeLabel = "In progress now";
  } else if (completedToday.length > 0 && pendingToday.length === 0) {
    nextTimeLabel = "All done for today";
  }

  return (
    <PageContainer>
      <PageHeader
        title="My Day"
        subtitle={`${greeting} — ${todayVisits.length} visit${todayVisits.length !== 1 ? "s" : ""} today · ${nextTimeLabel}`}
        actions={
          isTech ? (
            <LinkButton href="/app/field" variant="secondary" size="sm">
              On Site →
            </LinkButton>
          ) : undefined
        }
      />

      {todayVisits.length === 0 && upcomingVisits.length === 0 ? (
        <EmptyState
          title={isAdmin ? "No visits scheduled" : "No visits assigned"}
          description={
            isAdmin
              ? "Schedule visits from job detail pages."
              : "Visits will appear here when you're assigned."
          }
        />
      ) : (
        <MyDayView
          visits={pendingToday}
          completedVisits={completedToday}
          upcomingVisits={upcomingVisits}
          pastOverdueVisits={pastOverdueVisits}
          role={session.role}
          now={nowISO}
          statusLabels={VISIT_STATUS_LABELS}
        />
      )}
    </PageContainer>
  );
}
