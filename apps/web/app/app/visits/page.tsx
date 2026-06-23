import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canViewAllVisits } from "@/lib/auth/permissions";
import {
  formatOverdueLabel,
  isSameCalendarDay,
  isVisitOverdue,
} from "@/lib/visits/p7";
import { getTriageVisits } from "@/lib/visits/queries";
import {
  STATUS_ORDER,
  VISIT_STATUS_LABELS,
  type TriageVisitRow,
} from "@/lib/visits/triage";
import { VisitTriage, VisitItemCard } from "./VisitTriage";
import {
  PageContainer,
  PageHeader,
  StatusSection,
  EmptyState,
  Timeline,
  SectionHeader,
} from "@/components/ui";
import type { TimelineEntryData } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VisitsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllVisits(session.role);
  const isTech = session.role === "tech";

  // Admins share the triage query with the Schedule "List" view; techs see only
  // their own assigned visits.
  const visits: TriageVisitRow[] = isAdmin
    ? await getTriageVisits(session.accountId)
    : await query<TriageVisitRow>(
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

  const now = new Date();
  const currentHour = now.getHours();
  const timeGreeting =
    currentHour < 12
      ? "Good morning"
      : currentHour < 17
      ? "Good afternoon"
      : "Good evening";

  const todayVisits = visits.filter((v) => isSameCalendarDay(v.scheduled_start));

  // Tech-only views: a "My Day" timeline, an upcoming list, and the full set
  // grouped by status (techs see every assigned visit, overdue included).
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

  const techUpcoming = visits.filter(
    (v) => !isSameCalendarDay(v.scheduled_start) && v.status === "scheduled"
  );

  const techGroups = STATUS_ORDER.map((status) => ({
    status,
    visits: visits.filter((v) => v.status === status),
  })).filter((g) => g.visits.length > 0);

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

      {/* Owner/admin: the shared triage (also powers Schedule → List). */}
      {isAdmin && <VisitTriage visits={visits} />}

      {/* Tech: field-focused timeline + upcoming + full status list. */}
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
            <Timeline entries={techTodayEntries} emptyMessage="No visits today." />
          )}

          {techUpcoming.length > 0 && (
            <StatusSection title="Upcoming" count={techUpcoming.length}>
              {techUpcoming.map((v) => (
                <VisitItemCard key={v.id} visit={v} />
              ))}
            </StatusSection>
          )}

          {visits.length === 0 ? (
            <EmptyState
              title="No visits assigned"
              description="Visits will appear here when you're assigned."
              data-testid="visits-empty"
            />
          ) : (
            techGroups.map((g) => (
              <StatusSection
                key={g.status}
                title={VISIT_STATUS_LABELS[g.status]}
                count={g.visits.length}
              >
                {g.visits.map((v) => (
                  <VisitItemCard key={v.id} visit={v} showOverdue />
                ))}
              </StatusSection>
            ))
          )}
        </>
      )}
    </PageContainer>
  );
}
