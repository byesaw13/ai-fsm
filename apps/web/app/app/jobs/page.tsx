import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canTransitionJob, canViewAllJobs } from "@/lib/auth/permissions";
import type { Job, JobStatus } from "@ai-fsm/domain";
import {
  PageContainer,
  PageHeader,
  FilterBar,
  ItemCard,
  StatusSection,
  EmptyState,
  StatusBadge,
  PriorityBadge,
  LinkButton,
  priorityNumToVariant,
  priorityLabel,
} from "@/components/ui";
import type { FilterDef, StatusVariant, PriorityVariant } from "@/components/ui";

export const dynamic = "force-dynamic";

type JobRow = Job & { client_name: string | null };

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  quoted: "Quoted",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const JOB_STATUS_ORDER: JobStatus[] = [
  "in_progress",
  "scheduled",
  "quoted",
  "draft",
  "completed",
  "invoiced",
  "cancelled",
];

const JOB_FILTERS: FilterDef[] = [
  { name: "q", type: "text", label: "Search", placeholder: "Job title or client…" },
  {
    name: "status",
    type: "select",
    label: "Status",
    options: JOB_STATUS_ORDER.map((s) => ({ value: s, label: JOB_STATUS_LABELS[s] })),
  },
  {
    name: "priority",
    type: "select",
    label: "Priority",
    options: [
      { value: "4", label: "Urgent" },
      { value: "3", label: "High" },
      { value: "2", label: "Medium" },
      { value: "1", label: "Low" },
    ],
  },
];

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; priority?: string }>;
}

export default async function JobsPage({ searchParams }: PageProps) {
  const { q, status, priority } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllJobs(session.role);
  const canCreate = canTransitionJob(session.role);

  const searchPattern = q ? `%${q.toLowerCase()}%` : null;
  const statusFilter = status && JOB_STATUS_ORDER.includes(status as JobStatus) ? status : null;
  const priorityFilter = priority ? parseInt(priority) : null;

  let jobs: JobRow[];
  if (isAdmin) {
    const conditions: string[] = ["j.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

    if (searchPattern) {
      conditions.push(`(LOWER(j.title) LIKE $${idx} OR LOWER(c.name) LIKE $${idx})`);
      params.push(searchPattern);
      idx++;
    }
    if (statusFilter) {
      conditions.push(`j.status = $${idx}`);
      params.push(statusFilter);
      idx++;
    }
    if (priorityFilter !== null) {
      conditions.push(`j.priority = $${idx}`);
      params.push(priorityFilter);
      idx++;
    }

    jobs = await query<JobRow>(
      `SELECT j.*, c.name AS client_name
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY j.priority DESC, j.created_at DESC
       LIMIT 100`,
      params
    );
  } else {
    const conditions: string[] = ["j.account_id = $1", "v.assigned_user_id = $2"];
    const params: unknown[] = [session.accountId, session.userId];
    let idx = 3;

    if (searchPattern) {
      conditions.push(`(LOWER(j.title) LIKE $${idx} OR LOWER(c.name) LIKE $${idx})`);
      params.push(searchPattern);
      idx++;
    }
    if (statusFilter) {
      conditions.push(`j.status = $${idx}`);
      params.push(statusFilter);
      idx++;
    }
    if (priorityFilter !== null) {
      conditions.push(`j.priority = $${idx}`);
      params.push(priorityFilter);
      idx++;
    }

    jobs = await query<JobRow>(
      `SELECT DISTINCT j.*, c.name AS client_name
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       JOIN visits v ON v.job_id = j.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY j.priority DESC, j.created_at DESC
       LIMIT 100`,
      params
    );
  }

  const hasFilter = !!(q || statusFilter || priorityFilter);
  const currentValues: Record<string, string> = {};
  if (q) currentValues.q = q;
  if (status) currentValues.status = status;
  if (priority) currentValues.priority = priority;

  // Group by status for the unfiltered view
  const grouped = JOB_STATUS_ORDER.reduce<Record<string, JobRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );
  if (!hasFilter) {
    for (const job of jobs) {
      grouped[job.status]?.push(job);
    }
  }
  const activeStatuses = hasFilter
    ? []
    : JOB_STATUS_ORDER.filter((s) => grouped[s].length > 0);

  return (
    <PageContainer>
      <PageHeader
        title="Jobs"
        subtitle={
          isAdmin
            ? `All jobs — ${jobs.length} total`
            : `Your assigned jobs — ${jobs.length} total`
        }
        actions={
          canCreate ? (
            <LinkButton href="/app/jobs/new" variant="primary" data-testid="create-job-btn">
              + New Job
            </LinkButton>
          ) : undefined
        }
      />

      <FilterBar
        filters={JOB_FILTERS}
        baseHref="/app/jobs"
        currentValues={currentValues}
        submitLabel="Filter"
      />

      {jobs.length === 0 ? (
        <EmptyState
          title={
            hasFilter
              ? "No jobs match your filters"
              : isAdmin
                ? "No jobs yet"
                : "No assigned jobs"
          }
          description={
            hasFilter
              ? "Try adjusting your search or filters."
              : isAdmin
                ? "You'll need a client before creating a job."
                : "Jobs will appear here when you're assigned to visits."
          }
          action={
            canCreate && !hasFilter ? (
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "center" }}>
                <LinkButton href="/app/clients/new" variant="secondary">
                  + New Client
                </LinkButton>
                <LinkButton href="/app/jobs/new" variant="primary">
                  + New Job
                </LinkButton>
              </div>
            ) : undefined
          }
          data-testid="jobs-empty"
        />
      ) : hasFilter ? (
        // Flat list when filtered
        <div>
          {jobs.map((job) => (
            <JobItemCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        // Status-grouped sections when unfiltered
        <div>
          {activeStatuses.map((s) => (
            <StatusSection
              key={s}
              title={JOB_STATUS_LABELS[s as JobStatus]}
              count={grouped[s].length}
            >
              {grouped[s].map((job) => (
                <JobItemCard key={job.id} job={job} />
              ))}
            </StatusSection>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function JobItemCard({ job }: { job: JobRow }) {
  const pv: PriorityVariant | null = priorityNumToVariant(job.priority);
  const pl: string = priorityLabel(job.priority);

  const meta = (
    <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
      {job.client_name && (
        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {job.client_name}
        </span>
      )}
      {job.scheduled_start && (
        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {new Date(job.scheduled_start).toLocaleDateString()}
        </span>
      )}
    </div>
  );

  return (
    <ItemCard
      href={`/app/jobs/${job.id}`}
      title={job.title}
      titleBadge={
        pv ? (
          <PriorityBadge variant={pv}>{pl}</PriorityBadge>
        ) : undefined
      }
      meta={meta}
      actions={
        <StatusBadge variant={job.status as StatusVariant}>
          {JOB_STATUS_LABELS[job.status as JobStatus]}
        </StatusBadge>
      }
      data-testid="job-card"
    />
  );
}
