import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { PageContainer, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

interface VisitRow {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  job_title: string;
  client_name: string | null;
  property_address: string | null;
  tech_name: string | null;
  assigned_user_id: string | null;
  [key: string]: unknown;
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: "#2563eb",
  arrived: "#d97706",
  in_progress: "#16a34a",
  completed: "#6b7280",
  cancelled: "#dc2626",
};

function getWeekStart(dateStr: string | undefined): Date {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr + "T00:00:00");
    if (!isNaN(d.getTime())) {
      // Normalize to Monday
      const day = d.getDay(); // 0=Sun
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }
  // Default: start of current week (Monday)
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  now.setHours(0, 0, 0, 0);
  return now;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { week } = await searchParams;
  const weekStart = getWeekStart(week);
  const weekEnd = addDays(weekStart, 7);

  const isAdmin = session.role === "owner" || session.role === "admin";

  const visits = isAdmin
    ? await query<VisitRow>(
        `SELECT v.id, v.scheduled_start::text, v.scheduled_end::text, v.status,
                j.title AS job_title, c.name AS client_name,
                p.address AS property_address, u.full_name AS tech_name,
                v.assigned_user_id
         FROM visits v
         JOIN jobs j ON j.id = v.job_id
         LEFT JOIN clients c ON c.id = j.client_id
         LEFT JOIN properties p ON p.id = j.property_id
         LEFT JOIN users u ON u.id = v.assigned_user_id
         WHERE v.account_id = $1
           AND v.scheduled_start >= $2
           AND v.scheduled_start < $3
           AND v.status != 'cancelled'
         ORDER BY v.scheduled_start ASC`,
        [session.accountId, weekStart.toISOString(), weekEnd.toISOString()]
      )
    : await query<VisitRow>(
        `SELECT v.id, v.scheduled_start::text, v.scheduled_end::text, v.status,
                j.title AS job_title, c.name AS client_name,
                p.address AS property_address, u.full_name AS tech_name,
                v.assigned_user_id
         FROM visits v
         JOIN jobs j ON j.id = v.job_id
         LEFT JOIN clients c ON c.id = j.client_id
         LEFT JOIN properties p ON p.id = j.property_id
         LEFT JOIN users u ON u.id = v.assigned_user_id
         WHERE v.account_id = $1
           AND v.assigned_user_id = $2
           AND v.scheduled_start >= $3
           AND v.scheduled_start < $4
           AND v.status != 'cancelled'
         ORDER BY v.scheduled_start ASC`,
        [session.accountId, session.userId, weekStart.toISOString(), weekEnd.toISOString()]
      );

  // Group visits by day index (0=Mon … 6=Sun)
  const days: VisitRow[][] = Array.from({ length: 7 }, () => []);
  for (const v of visits) {
    const d = new Date(v.scheduled_start);
    const dayOfWeek = d.getDay(); // 0=Sun
    const idx = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Mon=0 … Sun=6
    days[idx].push(v);
  }

  const prevWeek = toDateStr(addDays(weekStart, -7));
  const nextWeek = toDateStr(addDays(weekStart, 7));
  const todayStr = toDateStr(new Date());
  const thisWeekStr = toDateStr(getWeekStart(undefined));
  const isThisWeek = toDateStr(weekStart) === thisWeekStr;

  const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <PageContainer>
      <PageHeader title="Schedule" subtitle={weekLabel} />

      {/* Week nav */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-5)", fontSize: "var(--text-sm)" }}>
        <Link href={`/app/schedule?week=${prevWeek}` as Route} style={{ color: "var(--accent)", textDecoration: "none" }}>← Prev</Link>
        {!isThisWeek && (
          <Link href="/app/schedule" style={{ color: "var(--fg-muted)", textDecoration: "none" }}>Today</Link>
        )}
        <Link href={`/app/schedule?week=${nextWeek}` as Route} style={{ color: "var(--accent)", textDecoration: "none" }}>Next →</Link>
      </div>

      {/* Calendar grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: "var(--space-2)",
        overflowX: "auto",
      }}>
        {DAY_LABELS.map((label, i) => {
          const dayDate = addDays(weekStart, i);
          const dayStr = toDateStr(dayDate);
          const isToday = dayStr === todayStr;
          const dayVisits = days[i];

          return (
            <div key={label} style={{ minWidth: 120 }}>
              {/* Day header */}
              <div style={{
                padding: "var(--space-2) var(--space-2)",
                marginBottom: "var(--space-2)",
                borderRadius: 6,
                background: isToday ? "var(--accent)" : "var(--bg-muted, #f4f4f5)",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: isToday ? "#fff" : "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {label}
                </div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: isToday ? "#fff" : "var(--fg)", marginTop: 2 }}>
                  {dayDate.getDate()}
                </div>
              </div>

              {/* Visit cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {dayVisits.length === 0 ? (
                  <div style={{ height: 40, borderRadius: 6, border: "1px dashed var(--border)", opacity: 0.4 }} />
                ) : (
                  dayVisits.map((v) => {
                    const start = new Date(v.scheduled_start);
                    const end = new Date(v.scheduled_end);
                    const timeStr = `${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
                    const color = STATUS_COLOR[v.status] ?? "#6b7280";

                    return (
                      <Link
                        key={v.id}
                        href={`/app/visits/${v.id}` as Route}
                        style={{ textDecoration: "none" }}
                      >
                        <div style={{
                          borderLeft: `3px solid ${color}`,
                          background: "#fff",
                          border: `1px solid var(--border)`,
                          borderLeftColor: color,
                          borderLeftWidth: 3,
                          borderRadius: 6,
                          padding: "var(--space-2) var(--space-2)",
                          cursor: "pointer",
                          transition: "box-shadow 0.1s",
                        }}>
                          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {v.job_title}
                          </div>
                          {v.client_name && (
                            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {v.client_name}
                            </div>
                          )}
                          <div style={{ fontSize: "var(--text-xs)", color, marginTop: 2, fontWeight: 500 }}>
                            {timeStr}
                          </div>
                          {v.tech_name && (
                            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 1 }}>
                              {v.tech_name}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {visits.length === 0 && (
        <div style={{ marginTop: "var(--space-8)", textAlign: "center", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          No visits scheduled for this week.{" "}
          <Link href="/app/visits" style={{ color: "var(--accent)" }}>View all visits →</Link>
        </div>
      )}
    </PageContainer>
  );
}
