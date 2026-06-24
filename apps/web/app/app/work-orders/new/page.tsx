import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import { buildWorkOrderDraft } from "@ai-fsm/domain";
import { PageContainer, PageHeader, Card, EmptyState } from "@/components/ui";
import { loadAssessmentSummary } from "@/lib/estimates/assessment-summary-loader";
import { WorkOrderForm } from "../WorkOrderForm";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ visit_id?: string; client_id?: string; property_id?: string; job_id?: string }>;
}

export default async function NewWorkOrderPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateEstimates(session.role)) redirect("/app/work-orders");

  const { visit_id, client_id, property_id, job_id } = await searchParams;

  const summary = visit_id ? await loadAssessmentSummary(session, visit_id) : null;
  const draft = summary ? buildWorkOrderDraft(summary) : null;

  // The work order needs a customer; from the URL (assessment hand-off).
  if (!client_id) {
    return (
      <PageContainer>
        <PageHeader title="New Work Order" backHref="/app/work-orders" backLabel="Work Orders" />
        <EmptyState title="Pick a customer" description="Open a work order from a site assessment, which carries the customer and property." />
      </PageContainer>
    );
  }

  const [cliRows, propRows] = await Promise.all([
    query<{ name: string }>(`SELECT name FROM clients WHERE id = $1 AND account_id = $2`, [client_id, session.accountId]),
    property_id
      ? query<{ address: string }>(`SELECT address FROM properties WHERE id = $1 AND account_id = $2`, [property_id, session.accountId])
      : Promise.resolve([]),
  ]);

  return (
    <PageContainer>
      <PageHeader title="New Work Order" backHref="/app/work-orders" backLabel="Work Orders" />
      <Card>
        <WorkOrderForm
          mode="create"
          clientId={client_id}
          clientName={cliRows[0]?.name ?? null}
          propertyId={property_id ?? null}
          propertyAddress={propRows[0]?.address ?? null}
          jobId={job_id ?? null}
          sourceVisitId={summary?.visitId ?? visit_id ?? null}
          sourceAssessmentId={summary?.assessmentId ?? null}
          initial={{
            title: draft?.title ?? "Work order",
            scope: draft?.scope ?? "",
            siteNotes: draft?.siteNotes ?? "",
            safetyNotes: draft?.safetyNotes ?? "",
            rooms: draft?.roomBreakdown ?? [],
            materials: [],
            status: "draft",
          }}
        />
      </Card>
    </PageContainer>
  );
}
