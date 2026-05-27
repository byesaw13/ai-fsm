import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryOneForSession, queryForSession } from "@/lib/db";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import { AssessmentForm } from "./AssessmentForm";
import type { Assessment } from "./AssessmentForm";
import { formatVisitDateLabel } from "@/lib/visits/p7";

export const dynamic = "force-dynamic";

type AssessmentRow = Assessment & Record<string, unknown>;

interface PhotoRow extends Record<string, unknown> {
  id: string;
  original_name: string;
  created_at: string;
}

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const visit = await queryOneForSession<{
    id: string;
    visit_type: string | null;
    status: string;
    assigned_user_id: string | null;
    scheduled_start: string | Date;
    job_id: string | null;
    job_title: string | null;
    job_client_id: string | null;
    job_property_id: string | null;
    [key: string]: unknown;
  }>(
    session,
    `SELECT v.id, v.visit_type, v.status, v.assigned_user_id, v.scheduled_start, v.job_id,
            j.title AS job_title, j.client_id AS job_client_id, j.property_id AS job_property_id
     FROM visits v
     LEFT JOIN jobs j ON j.id = v.job_id
     WHERE v.id = $1 AND v.account_id = $2`,
    [id, session.accountId]
  );

  if (!visit) notFound();

  if (visit.visit_type !== "site_visit") {
    redirect(`/app/visits/${id}`);
  }

  if (session.role === "tech" && visit.assigned_user_id !== session.userId) {
    notFound();
  }

  const assessment = await queryOneForSession<AssessmentRow>(
    session,
    `SELECT * FROM site_visit_assessments WHERE visit_id = $1 AND account_id = $2`,
    [id, session.accountId]
  );

  const photos = await queryForSession<PhotoRow>(
    session,
    `SELECT id, original_name, created_at FROM visit_media
     WHERE visit_id = $1 AND account_id = $2 AND category = 'assessment'
     ORDER BY created_at`,
    [id, session.accountId]
  );

  const canEdit = visit.status !== "cancelled" && visit.status !== "completed"
    ? true
    : session.role !== "tech";

  const toISO = (v: unknown): string =>
    v instanceof Date ? v.toISOString() : String(v ?? "");

  return (
    <PageContainer>
      <PageHeader
        title="Site Assessment"
        subtitle={formatVisitDateLabel(toISO(visit.scheduled_start))}
        backHref={`/app/visits/${id}`}
        backLabel={visit.job_title ?? "Visit"}
      />
      <Card>
        <AssessmentForm
          visitId={id}
          jobId={visit.job_id}
          jobTitle={visit.job_title}
          clientId={visit.job_client_id}
          propertyId={visit.job_property_id}
          initialAssessment={assessment}
          initialPhotos={photos}
          canEdit={canEdit}
        />
      </Card>
    </PageContainer>
  );
}
