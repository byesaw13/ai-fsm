import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { PageContainer, PageHeader } from "@/components/ui";
import { TimelineEditor } from "../TimelineEditor";
import { LocationSegmentsPanel } from "../LocationSegmentsPanel";
import { VisitCandidatesPanel } from "../VisitCandidatesPanel";
import { ManualSiteVisitButton } from "../ManualSiteVisitButton";
import { DayMapPanel } from "../DayMapPanel";
import type { ActivityEntryDto } from "../ActivityTracker";

export const dynamic = "force-dynamic";

// Treat the timeline as a reconstructable record (TASK-019): the owner picks any
// day and corrects the activity blocks recorded for it. Date comes from
// ?date=YYYY-MM-DD and defaults to today.

function normalizeDate(input: string | undefined): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // The timeline edits the account-wide time ledger (entries keyed by account,
  // not by user), so it is owner/admin-only. Techs track their own time via the
  // My Day activity bar. EPIC-006: techs land on My Day.
  if (session.role === "tech") redirect("/app/my-work");

  const { date } = await searchParams;
  const day = normalizeDate(date);

  const entries = await queryForSession<ActivityEntryDto>(
    session,
    `SELECT id, activity_type, category, started_at::text, ended_at::text,
            entity_type, entity_id, assignment_kind, labor_bucket, note
     FROM activity_entries
     WHERE account_id = $1 AND session_date = $2::date AND voided_at IS NULL
     ORDER BY started_at ASC`,
    [session.accountId, day]
  );


  const needsJobLink = await queryForSession<{
    id: string;
    activity_type: string;
    started_at: string;
    ended_at: string;
    note: string | null;
  }>(
    session,
    `SELECT id, activity_type, started_at::text, ended_at::text, note
     FROM activity_entries
     WHERE account_id = $1
       AND session_date = $2::date
       AND voided_at IS NULL
       AND entity_id IS NULL
       AND ended_at IS NOT NULL
       AND activity_type IN ('job_work','travel','material_run','estimate_visit','follow_up')
     ORDER BY started_at ASC`,
    [session.accountId, day]
  );

  const label = new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <PageContainer>
      <PageHeader
        title="Activity Timeline"
        subtitle={label}
        actions={<ManualSiteVisitButton />}
      />
      <TimelineEditor date={day} entries={entries} needsJobLink={needsJobLink} />
      <div style={{ marginTop: "var(--space-6)" }}>
        <VisitCandidatesPanel day={day} entries={entries} />
      </div>
      <div style={{ marginTop: "var(--space-6)" }}>
        <DayMapPanel day={day} />
      </div>
      <div style={{ marginTop: "var(--space-6)" }}>
        <LocationSegmentsPanel day={day} entries={entries} />
      </div>
    </PageContainer>
  );
}
