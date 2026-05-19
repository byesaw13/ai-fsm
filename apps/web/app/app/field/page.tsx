import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { isSameCalendarDay } from "@/lib/visits/p7";
import { canViewAllVisits } from "@/lib/auth/permissions";
import { PageContainer, PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { FieldVisitCard } from "./FieldVisitCard";

export const dynamic = "force-dynamic";

type VisitRow = {
  id: string;
  status: string;
  scheduled_start: string | null;
  active_time_started_at: string | null;
  job_id: string | null;
  job_title: string | null;
  client_name: string | null;
  property_address: string | null;
};

export default async function FieldPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllVisits(session.role);

	  const visits = await query<VisitRow>(
	    `SELECT
       v.id, v.status, v.scheduled_start, v.job_id,
       vtl.started_at AS active_time_started_at,
       j.title AS job_title,
       c.name AS client_name,
       p.address AS property_address
     FROM visits v
     LEFT JOIN jobs j ON j.id = v.job_id
     LEFT JOIN clients c ON c.id = j.client_id
     LEFT JOIN properties p ON p.id = j.property_id
     LEFT JOIN visit_time_logs vtl
       ON vtl.visit_id = v.id
      AND vtl.account_id = v.account_id
      AND vtl.ended_at IS NULL
     WHERE v.account_id = $1
       ${!isAdmin ? "AND v.assigned_user_id = $2" : ""}
       AND v.status NOT IN ('cancelled','completed')
     ORDER BY v.scheduled_start ASC NULLS LAST
     LIMIT 50`,
    isAdmin ? [session.accountId] : [session.accountId, session.userId]
  );

  const todayVisits = visits.filter((v) => v.scheduled_start && isSameCalendarDay(v.scheduled_start));
  const upcomingVisits = visits.filter((v) => v.scheduled_start && !isSameCalendarDay(v.scheduled_start));

  const activeVisit = todayVisits.find(
    (v) => v.status === "in_progress" || v.status === "arrived"
  );

  const nowHour = new Date().getHours();
  const greeting = nowHour < 12 ? "Morning" : nowHour < 17 ? "Afternoon" : "Evening";

  return (
    <PageContainer>
      <PageHeader
        title="On Site"
        subtitle={
          activeVisit
            ? `Active: ${activeVisit.job_title ?? "Visit"}`
            : `${greeting} — ${todayVisits.length} visit${todayVisits.length !== 1 ? "s" : ""} today · tap to start`
        }
        actions={
          <LinkButton href="/app/my-day" variant="ghost" size="sm">
            Day Overview
          </LinkButton>
        }
      />

      {todayVisits.length === 0 && upcomingVisits.length === 0 ? (
        <EmptyState
          title="No active visits"
          description="Nothing to work on right now. Check your day overview or the schedule."
          action={
            <LinkButton href="/app/my-day" variant="secondary">
              Day Overview
            </LinkButton>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 480 }}>
          {todayVisits.length > 0 && (
            <div>
              <p
                style={{
                  margin: "0 0 var(--space-3)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--fg-muted)",
                }}
              >
                Today
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {todayVisits.map((v) => (
                  <FieldVisitCard key={v.id} visit={v} />
                ))}
              </div>
            </div>
          )}

          {upcomingVisits.length > 0 && (
            <div>
              <p
                style={{
                  margin: "0 0 var(--space-3)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--fg-muted)",
                }}
              >
                Upcoming
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {upcomingVisits.map((v) => (
                  <FieldVisitCard key={v.id} visit={v} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
