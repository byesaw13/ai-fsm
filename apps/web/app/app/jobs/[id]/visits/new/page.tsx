import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateVisit, canAssignVisit } from "@/lib/auth/permissions";
import { query, queryOne } from "@/lib/db";
import { VisitScheduleForm } from "./VisitScheduleForm";
import { Card, PageContainer, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Job {
  id: string;
  title: string | null;
  job_category: string | null;
  [key: string]: unknown;
}

interface User {
  id: string;
  full_name: string;
  role: string;
  [key: string]: unknown;
}

export default async function NewVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    bookingRequestId?: string;
    work_order_id?: string;
    multi?: string;
    visit_type?: string;
    intent?: string;
    date?: string;
    start?: string;
    duration?: string;
    assigned_user_id?: string;
  }>;
}) {
  const { id } = await params;
  const {
    bookingRequestId,
    work_order_id,
    multi,
    visit_type,
    intent,
    date,
    start,
    duration,
    assigned_user_id,
  } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateVisit(session.role)) redirect(`/app/jobs/${id}`);

  const job = await queryOne<Job>(
    `SELECT id, title, job_category FROM jobs WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );

  if (!job) notFound();

  const canAssign = canAssignVisit(session.role);

  const users = canAssign
    ? await query<User>(
        `SELECT id, full_name, role FROM users WHERE account_id = $1 ORDER BY full_name ASC`,
        [session.accountId]
      )
    : [];

  // Bookable WOs only (draft promoted to ready on book). Completed/cancelled excluded.
  const workOrders = await query<{ id: string; title: string; status: string }>(
    `SELECT id, title, status FROM work_orders
     WHERE job_id = $1 AND account_id = $2
       AND status IN ('draft','ready','scheduled','dispatched','waiting')
     ORDER BY created_at ASC`,
    [id, session.accountId],
  );

  // If a specific WO was requested but not in list (wrong job), still pass id for error clarity
  const initialWorkOrderId = work_order_id ?? null;
  const backHref = initialWorkOrderId
    ? `/app/work-orders/${initialWorkOrderId}`
    : `/app/jobs/${id}`;
  const backLabel = initialWorkOrderId ? "Work Order" : (job.title ?? "Project");

  const resolvedIntent =
    intent === "assessment" || visit_type === "site_visit"
      ? "assessment"
      : intent === "book_work" || visit_type === "standard"
        ? "book_work"
        : null;

  const hasPrefill = Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date));

  const pageTitle =
    multi === "1"
      ? "Schedule Multiple Days"
      : resolvedIntent === "assessment"
        ? "Schedule Assessment"
        : resolvedIntent === "book_work" || hasPrefill
          ? "Add a Day to the Schedule"
          : "Schedule Visit";

  const helper =
    resolvedIntent === "assessment"
      ? "Creates an Assessment visit (site visit) with the assessment form for scope capture — not a work day."
      : resolvedIntent === "book_work" || hasPrefill
        ? hasPrefill
          ? "Date, hours, and crew are prefilled from the last work day — change anything before saving."
          : "Creates a work day under a work order. Scope is assumed clear enough to execute."
        : "Field days are visits under a work order when type is Work Day. Assessments do not use a work order.";

  const parsedDuration = duration ? Number.parseInt(duration, 10) : null;
  const initialDuration =
    parsedDuration && Number.isFinite(parsedDuration) && parsedDuration > 0
      ? parsedDuration
      : null;
  const initialStartTime =
    start && /^\d{2}:\d{2}$/.test(start) ? start : null;
  const initialDate = hasPrefill ? date! : null;
  const initialAssignedUserId =
    assigned_user_id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      assigned_user_id,
    )
      ? assigned_user_id
      : null;

  return (
    <PageContainer>
      <PageHeader
        title={pageTitle}
        subtitle={job.title ?? undefined}
        backHref={backHref}
        backLabel={backLabel}
      />
      <Card>
        <p className="muted" style={{ marginTop: 0, marginBottom: "var(--space-3)", fontSize: "var(--text-sm)" }}>
          {helper}
        </p>
        <VisitScheduleForm
          jobId={id}
          users={users}
          canAssign={canAssign}
          jobCategory={job.job_category ?? null}
          bookingRequestId={bookingRequestId}
          workOrders={workOrders}
          initialWorkOrderId={initialWorkOrderId}
          initialMultiDay={multi === "1"}
          initialVisitType={
            visit_type === "site_visit" ||
            visit_type === "standard" ||
            visit_type === "punch_list" ||
            visit_type === "sales_walkthrough"
              ? visit_type
              : null
          }
          intent={resolvedIntent}
          initialDate={initialDate}
          initialStartTime={initialStartTime}
          initialDuration={initialDuration}
          initialAssignedUserId={initialAssignedUserId}
        />
      </Card>
    </PageContainer>
  );
}
