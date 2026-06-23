import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { PageContainer, PageHeader } from "@/components/ui";
import { getTriageVisits } from "@/lib/visits/queries";
import { ScheduleCalendar } from "./ScheduleCalendar";
import type { VisitRow, ViewMode } from "./ScheduleCalendar";
import { ScheduleViewToggle } from "./ScheduleViewToggle";
import { VisitTriage } from "../visits/VisitTriage";

export const dynamic = "force-dynamic";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekStart(dateStr: string | undefined): Date {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr + "T00:00:00");
    if (!isNaN(d.getTime())) {
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }
  const now = new Date();
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
  now.setDate(now.getDate() + diff);
  now.setHours(0, 0, 0, 0);
  return now;
}

function parseMonthParam(param: string | undefined): [number, number] {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12 && y >= 2020 && y <= 2100) return [y, m];
  }
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1];
}

interface PageProps {
  searchParams: Promise<{ view?: string; week?: string; month?: string; year?: string }>;
}

const VISIT_SELECT = `
  SELECT v.id, v.scheduled_start::text, v.scheduled_end::text, v.status,
         j.title AS job_title, c.name AS client_name,
         p.address AS property_address, u.full_name AS tech_name,
         v.assigned_user_id
  FROM visits v
  JOIN jobs j ON j.id = v.job_id
  LEFT JOIN clients c ON c.id = j.client_id
  LEFT JOIN properties p ON p.id = j.property_id
  LEFT JOIN users u ON u.id = v.assigned_user_id`;

export default async function SchedulePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.role === "owner" || session.role === "admin";

  const params = await searchParams;
  const allowed = isAdmin ? ["week", "month", "year", "list"] : ["week", "month", "year"];
  const view = (allowed.includes(params.view ?? "") ? params.view : "week") as ViewMode;

  // List (triage) view — owner/admin only. Loads every visit for the account
  // rather than the calendar's date range.
  if (view === "list") {
    const visits = await getTriageVisits(session.accountId);
    return (
      <PageContainer>
        <PageHeader title="Schedule" />
        <div style={{ marginBottom: "var(--space-4)" }}>
          <ScheduleViewToggle
            current="list"
            isAdmin={isAdmin}
            weekUrl="/app/schedule?view=week"
            monthUrl="/app/schedule?view=month"
            yearUrl="/app/schedule?view=year"
          />
        </div>
        <VisitTriage visits={visits} />
      </PageContainer>
    );
  }

  let rangeStart: Date, rangeEnd: Date;
  if (view === "week") {
    rangeStart = getWeekStart(params.week);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeStart.getDate() + 7);
  } else if (view === "month") {
    const [y, m] = parseMonthParam(params.month);
    rangeStart = new Date(y, m - 1, 1);
    rangeEnd = new Date(y, m, 1);
  } else {
    const y = parseInt(params.year ?? "") || new Date().getFullYear();
    rangeStart = new Date(y, 0, 1);
    rangeEnd = new Date(y + 1, 0, 1);
  }

  const visits = isAdmin
    ? await query<VisitRow>(
        `${VISIT_SELECT}
         WHERE v.account_id = $1
           AND v.scheduled_start >= $2
           AND v.scheduled_start < $3
           AND v.status != 'cancelled'
         ORDER BY v.scheduled_start ASC`,
        [session.accountId, rangeStart.toISOString(), rangeEnd.toISOString()]
      )
    : await query<VisitRow>(
        `${VISIT_SELECT}
         WHERE v.account_id = $1
           AND v.assigned_user_id = $2
           AND v.scheduled_start >= $3
           AND v.scheduled_start < $4
           AND v.status != 'cancelled'
         ORDER BY v.scheduled_start ASC`,
        [session.accountId, session.userId, rangeStart.toISOString(), rangeEnd.toISOString()]
      );

  return (
    <PageContainer>
      <PageHeader title="Schedule" />
      <ScheduleCalendar
        visits={visits}
        view={view}
        rangeStart={toDateStr(rangeStart)}
        isAdmin={isAdmin}
      />
    </PageContainer>
  );
}
