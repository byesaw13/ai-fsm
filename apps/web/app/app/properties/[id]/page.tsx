import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients, canTransitionJob } from "@/lib/auth/permissions";
import { query, queryOne } from "@/lib/db";
import { buildJobCreateHref, formatPropertyAddress } from "@/lib/crm/p7";
import {
  Card,
  EmptyState,
  ItemCard,
  LinkButton,
  MetricGrid,
  PageContainer,
  PageHeader,
  SectionHeader,
  Timeline,
} from "@/components/ui";
import type { TimelineEntryData } from "@/components/ui";
import { PropertyForm } from "../PropertyForm";

export const dynamic = "force-dynamic";

type PropertyRow = {
  id: string;
  client_id: string;
  client_name: string;
  name: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  job_count: number | string;
  visit_count: number | string;
};

type ClientOption = { id: string; name: string };
type JobRow = { id: string; title: string; status: string; created_at: string };
type VisitRow = { id: string; status: string; scheduled_start: string; job_title: string };

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const property = await queryOne<PropertyRow>(
    `SELECT p.*, c.name AS client_name,
            COUNT(DISTINCT j.id)::int AS job_count,
            COUNT(DISTINCT v.id)::int AS visit_count
     FROM properties p
     JOIN clients c ON c.id = p.client_id AND c.account_id = p.account_id
     LEFT JOIN jobs j ON j.property_id = p.id AND j.account_id = p.account_id
     LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = p.account_id
     WHERE p.id = $1 AND p.account_id = $2
     GROUP BY p.id, c.name`,
    [id, session.accountId]
  );
  if (!property) notFound();

  const [clients, jobs, visits] = await Promise.all([
    query<ClientOption>(`SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC`, [session.accountId]),
    query<JobRow>(
      `SELECT id, title, status, created_at
       FROM jobs
       WHERE property_id = $1 AND account_id = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [id, session.accountId]
    ),
    query<VisitRow>(
      `SELECT v.id, v.status, v.scheduled_start, j.title AS job_title
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       WHERE j.property_id = $1 AND v.account_id = $2
       ORDER BY v.scheduled_start DESC
       LIMIT 10`,
      [id, session.accountId]
    ),
  ]);

  const activityEntries: TimelineEntryData[] = visits.map((v) => ({
    id: v.id,
    timestamp: v.scheduled_start,
    title: v.job_title,
    subtitle: `Visit ${v.status.replaceAll("_", " ")}`,
    status: v.status,
    href: `/app/visits/${v.id}`,
    isCompleted: v.status === "completed" || v.status === "cancelled",
  }));

  return (
    <PageContainer>
      <PageHeader
        title={property.name?.trim() || "Property"}
        subtitle={formatPropertyAddress(property)}
        backHref="/app/properties"
        backLabel="Properties"
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <LinkButton href={`/app/clients/${property.client_id}`} variant="secondary" size="sm">
              Client
            </LinkButton>
            {canTransitionJob(session.role) ? (
              <LinkButton href={buildJobCreateHref(property.client_id, property.id)} variant="primary" size="sm" data-testid="create-job-from-property-btn">
                + Job
              </LinkButton>
            ) : null}
          </div>
        }
      />

      <MetricGrid
        metrics={[
          { label: "Jobs", value: Number(property.job_count) },
          { label: "Visits", value: Number(property.visit_count) },
          { label: "Client", value: property.client_name, href: `/app/clients/${property.client_id}` },
        ]}
      />

      <div className="p7-detail-layout" style={{ marginTop: "var(--space-4)" }}>
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader title="Visit History" />
            <Timeline entries={activityEntries} emptyMessage="No visits scheduled at this property yet." />
          </Card>

          <Card>
            <SectionHeader title="Jobs" count={jobs.length} />
            {jobs.length === 0 ? (
              <EmptyState title="No jobs yet" description="Create a job from this property to start tracking work here." />
            ) : (
              <div>
                {jobs.map((job) => (
                  <ItemCard
                    key={job.id}
                    href={`/app/jobs/${job.id}`}
                    title={job.title}
                    meta={<div>Status: {job.status.replaceAll("_", " ")}</div>}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="p7-detail-sidebar">
          <Card>
            <SectionHeader title="Property Details" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row"><dt>Client</dt><dd><LinkButton href={`/app/clients/${property.client_id}`} variant="ghost" size="sm">{property.client_name}</LinkButton></dd></div>
              <div className="p7-detail-row"><dt>Address</dt><dd>{property.address}</dd></div>
              <div className="p7-detail-row"><dt>City</dt><dd>{property.city || "—"}</dd></div>
              <div className="p7-detail-row"><dt>State</dt><dd>{property.state || "—"}</dd></div>
              <div className="p7-detail-row"><dt>ZIP</dt><dd>{property.zip || "—"}</dd></div>
              <div className="p7-detail-row"><dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{property.notes || "No notes"}</dd></div>
            </dl>
          </Card>

          <Card data-testid="property-edit-panel">
            <SectionHeader title="Edit Property" />
            <PropertyForm
              mode="edit"
              actionUrl={`/api/v1/properties/${property.id}`}
              cancelHref={`/app/properties/${property.id}`}
              propertyId={property.id}
              clients={clients}
              initialValues={{
                client_id: property.client_id,
                name: property.name ?? "",
                address: property.address,
                city: property.city ?? "",
                state: property.state ?? "",
                zip: property.zip ?? "",
                notes: property.notes ?? "",
              }}
            />
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
