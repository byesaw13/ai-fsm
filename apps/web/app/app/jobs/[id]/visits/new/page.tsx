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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateVisit(session.role)) redirect(`/app/jobs/${id}`);

  const job = await queryOne<Job>(
    `SELECT id, title FROM jobs WHERE id = $1 AND account_id = $2`,
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

  return (
    <PageContainer>
      <PageHeader
        title="Schedule Visit"
        subtitle={job.title ?? undefined}
        backHref={`/app/jobs/${id}`}
        backLabel={job.title ?? "Job"}
      />
      <Card>
        <VisitScheduleForm jobId={id} users={users} canAssign={canAssign} />
      </Card>
    </PageContainer>
  );
}
