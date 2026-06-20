import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query, queryForSession } from "@/lib/db";
import { isSameCalendarDay, isVisitOverdue, formatOverdueLabel } from "@/lib/visits/p7";
import { MyDayView } from "./MyDayView";
import { WorkdayPanel } from "../WorkdayPanel";
import type { OpenSession, VehicleOption } from "../WorkdayPanel";
import type { ActivityEntryDto } from "../ActivityTracker";
import { summarizeDayMileage, type VehicleSessionRow } from "@/lib/mileage/sessions";
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
  // EPIC-006: My Day is the field surface for technicians AND owner-as-technician.
  // (Owners reach it from the nav; their default landing is still the dashboard.)

  const isTech = session.role === "tech";
  const accountId = session.accountId;

  // My Day is "do the work" — always the viewer's OWN assigned visits, for every
  // role (including owner-as-technician). EPIC-006: never the all-techs list here.
  const visits = await query<VisitRow>(
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

  // Field workday data (EPIC-006 TASK-029) — Start/End Day, vehicle, activity,
  // mileage. Duplicated from the owner dashboard's queries so /app stays untouched.
  const [openSessionRows, fieldVehicles, fieldActivity, todaySessionRows, yesterdayMilesRows] = await Promise.all([
    queryForSession<OpenSession>(session,
      `SELECT s.id, s.session_date::text, s.vehicle_id, v.nickname AS vehicle_nickname,
              v.plate AS vehicle_plate, s.start_odometer, s.started_at::text AS started_at
       FROM vehicle_sessions s LEFT JOIN vehicles v ON v.id = s.vehicle_id
       WHERE s.account_id = $1 AND s.session_date = CURRENT_DATE
         AND s.end_odometer IS NULL AND s.miles IS NULL
       ORDER BY s.started_at DESC LIMIT 1`,
      [accountId]),
    queryForSession<VehicleOption>(session,
      `SELECT v.id, v.nickname, v.plate,
              last_s.end_odometer AS current_odometer,
              (SELECT max(started_at) FROM vehicle_sessions
                 WHERE vehicle_id = v.id AND account_id = v.account_id)::text AS last_used_at
       FROM vehicles v
       LEFT JOIN LATERAL (
         SELECT end_odometer, session_date FROM vehicle_sessions
         WHERE vehicle_id = v.id AND account_id = v.account_id AND end_odometer IS NOT NULL
         ORDER BY session_date DESC, created_at DESC LIMIT 1
       ) last_s ON true
       WHERE v.account_id = $1 AND v.is_active = true
       ORDER BY v.nickname ASC`,
      [accountId]),
    queryForSession<ActivityEntryDto>(session,
      `SELECT id, activity_type, category, started_at::text, ended_at::text,
              entity_type, entity_id, note
       FROM activity_entries
       WHERE account_id = $1 AND (session_date = CURRENT_DATE OR ended_at IS NULL) AND voided_at IS NULL
       ORDER BY started_at ASC`,
      [accountId]),
    queryForSession<VehicleSessionRow>(session,
      `SELECT s.vehicle_id, v.nickname AS vehicle_nickname, v.plate AS vehicle_plate,
              s.start_odometer, s.end_odometer, s.miles::float8 AS miles
       FROM vehicle_sessions s LEFT JOIN vehicles v ON v.id = s.vehicle_id
       WHERE s.account_id = $1 AND s.session_date = CURRENT_DATE
       ORDER BY s.started_at ASC`,
      [accountId]),
    queryForSession<{ count: string }>(session,
      `SELECT COALESCE(SUM(miles), 0)::text AS count
       FROM vehicle_sessions
       WHERE account_id = $1 AND session_date = CURRENT_DATE - interval '1 day'`,
      [accountId]),
  ]);
  const dayMileage = summarizeDayMileage(todaySessionRows);
  const yesterdayMiles = parseInt(yesterdayMilesRows[0]?.count ?? "0", 10);
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

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
            <LinkButton href="/app/visits" variant="secondary" size="sm">Visits →</LinkButton>
          ) : undefined
        }
      />

      {/* Field workday: Start/End Day, vehicle, activity, mileage (EPIC-006) */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <WorkdayPanel
          surface="my_day"
          todayLabel={todayLabel}
          openSession={openSessionRows[0] ?? null}
          vehicles={fieldVehicles}
          activityEntries={fieldActivity}
          dayMileage={dayMileage}
          yesterdayMiles={yesterdayMiles}
        />
      </div>

      {todayVisits.length === 0 && upcomingVisits.length === 0 ? (
        <EmptyState
          title="No visits assigned"
          description="Visits assigned to you appear here. Your workday actions are above."
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
