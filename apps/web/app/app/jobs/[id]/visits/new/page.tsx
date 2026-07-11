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
  searchParams: Promise<{ bookingRequestId?: string; work_order_id?: string; multi?: string }>;
}) {
  const { id } = await params;
  const { bookingRequestId, work_order_id, multi } = await searchParams;
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

  return (
    <PageContainer>
      <PageHeader
        title={multi === "1" ? "Schedule Multiple Days" : "Schedule Visit"}
        subtitle={job.title ?? undefined}
        backHref={backHref}
        backLabel={backLabel}
      />
      <Card>
        <p className="muted" style={{ marginTop: 0, marginBottom: "var(--space-3)", fontSize: "var(--text-sm)" }}>
          Field days are <strong>visits</strong> under a work order. The work order holds scope;
          each visit is one calendar day of work.
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
        />
      </Card>
    </PageContainer>
  );
}
