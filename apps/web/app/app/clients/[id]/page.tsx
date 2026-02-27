import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates, canManageClients, canTransitionJob } from "@/lib/auth/permissions";
import { query, queryOne } from "@/lib/db";
import { buildJobCreateHref, formatClientContact, formatPropertyAddress } from "@/lib/crm/p7";
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
import { ClientForm } from "../ClientForm";
import type { TimelineEntryData } from "@/components/ui";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  company_name: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: string;
  updated_at: string;
  property_count: number | string;
  job_count: number | string;
  estimate_count: number | string;
  invoice_count: number | string;
};

type PropertyRow = {
  id: string;
  name: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: string;
};

type JobRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

type VisitRow = {
  id: string;
  status: string;
  scheduled_start: string;
  job_title: string;
};

type FinancialSummary = {
  estimate_total_cents: string;
  invoice_total_cents: string;
  paid_total_cents: string;
};

function dollars(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const client = await queryOne<ClientRow>(
    `SELECT c.*,
            COUNT(DISTINCT p.id)::int AS property_count,
            COUNT(DISTINCT j.id)::int AS job_count,
            COUNT(DISTINCT e.id)::int AS estimate_count,
            COUNT(DISTINCT i.id)::int AS invoice_count
     FROM clients c
     LEFT JOIN properties p ON p.client_id = c.id AND p.account_id = c.account_id
     LEFT JOIN jobs j ON j.client_id = c.id AND j.account_id = c.account_id
     LEFT JOIN estimates e ON e.client_id = c.id AND e.account_id = c.account_id
     LEFT JOIN invoices i ON i.client_id = c.id AND i.account_id = c.account_id
     WHERE c.id = $1 AND c.account_id = $2
     GROUP BY c.id`,
    [id, session.accountId]
  );
  if (!client) notFound();

  const [properties, recentJobs, recentVisits, finance] = await Promise.all([
    query<PropertyRow>(
      `SELECT id, name, address, city, state, zip, created_at
       FROM properties
       WHERE client_id = $1 AND account_id = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [id, session.accountId]
    ),
    query<JobRow>(
      `SELECT id, title, status, created_at
       FROM jobs
       WHERE client_id = $1 AND account_id = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [id, session.accountId]
    ),
    query<VisitRow>(
      `SELECT v.id, v.status, v.scheduled_start, j.title AS job_title
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       WHERE j.client_id = $1 AND v.account_id = $2
       ORDER BY v.scheduled_start DESC
       LIMIT 10`,
      [id, session.accountId]
    ),
    queryOne<FinancialSummary>(
      `SELECT
         COALESCE((SELECT SUM(total_cents) FROM estimates WHERE client_id = $1 AND account_id = $2), 0)::text AS estimate_total_cents,
         COALESCE((SELECT SUM(total_cents) FROM invoices WHERE client_id = $1 AND account_id = $2), 0)::text AS invoice_total_cents,
         COALESCE((SELECT SUM(paid_cents) FROM invoices WHERE client_id = $1 AND account_id = $2), 0)::text AS paid_total_cents`,
      [id, session.accountId]
    ),
  ]);

  const activityEntries: TimelineEntryData[] = recentVisits.map((v) => ({
    id: v.id,
    timestamp: v.scheduled_start,
    title: v.job_title,
    subtitle: `Visit ${v.status.replaceAll("_", " ")}`,
    status: v.status,
    href: `/app/visits/${v.id}`,
    isCompleted: v.status === "completed" || v.status === "cancelled",
  }));

  const canCreateJobs = canTransitionJob(session.role);
  const canCreateEstimate = canCreateEstimates(session.role);
  const estimateTotal = Number(finance?.estimate_total_cents ?? 0);
  const invoiceTotal = Number(finance?.invoice_total_cents ?? 0);
  const paidTotal = Number(finance?.paid_total_cents ?? 0);

  return (
    <PageContainer>
      <PageHeader
        title={client.name}
        subtitle={formatClientContact(client)}
        backHref="/app/clients"
        backLabel="Clients"
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <LinkButton href={`/app/properties/new?client_id=${client.id}`} variant="secondary" size="sm" data-testid="add-property-btn">
              + Property
            </LinkButton>
            {canCreateEstimate ? (
              <LinkButton href={`/app/estimates/new?client_id=${client.id}`} variant="secondary" size="sm" data-testid="create-estimate-from-client-btn">
                + Estimate
              </LinkButton>
            ) : null}
            {canCreateJobs ? (
              <LinkButton href={buildJobCreateHref(client.id)} variant="primary" size="sm" data-testid="create-job-from-client-btn">
                + Job
              </LinkButton>
            ) : null}
          </div>
        }
      />

      <MetricGrid
        metrics={[
          { label: "Properties", value: Number(client.property_count) },
          { label: "Jobs", value: Number(client.job_count) },
          { label: "Estimates", value: Number(client.estimate_count), sub: dollars(estimateTotal) },
          { label: "Invoices", value: Number(client.invoice_count), sub: `${dollars(invoiceTotal)} total • ${dollars(paidTotal)} paid` },
        ]}
      />

      <div className="p7-detail-layout" style={{ marginTop: "var(--space-4)" }}>
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader
              title="Properties"
              count={properties.length}
              action={<LinkButton href={`/app/properties/new?client_id=${client.id}`} variant="ghost" size="sm">Add Property</LinkButton>}
            />
            {properties.length === 0 ? (
              <EmptyState title="No properties yet" description="Create a property to track service locations for this client." />
            ) : (
              <div>
                {properties.map((p) => (
                  <ItemCard
                    key={p.id}
                    href={`/app/properties/${p.id}`}
                    title={p.name?.trim() || p.address}
                    meta={<div>{formatPropertyAddress(p)}</div>}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="Recent Activity" />
            <Timeline entries={activityEntries} emptyMessage="No visits yet for this client." />
          </Card>

          <Card>
            <SectionHeader title="Recent Jobs" count={recentJobs.length} />
            {recentJobs.length === 0 ? (
              <EmptyState title="No jobs yet" description="Jobs created for this client will appear here." />
            ) : (
              <div>
                {recentJobs.map((job) => (
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
            <SectionHeader title="Client Details" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row"><dt>Name</dt><dd>{client.name}</dd></div>
              <div className="p7-detail-row"><dt>Company</dt><dd>{client.company_name || "—"}</dd></div>
              <div className="p7-detail-row"><dt>Email</dt><dd>{client.email || "—"}</dd></div>
              <div className="p7-detail-row"><dt>Phone</dt><dd>{client.phone || "—"}</dd></div>
              <div className="p7-detail-row"><dt>Address</dt><dd>{client.address_line1 || "—"}</dd></div>
              <div className="p7-detail-row"><dt>City / State / ZIP</dt><dd>{[client.city, client.state, client.zip].filter(Boolean).join(" ") || "—"}</dd></div>
              <div className="p7-detail-row"><dt>Created</dt><dd>{new Date(client.created_at).toLocaleDateString()}</dd></div>
              <div className="p7-detail-row"><dt>Updated</dt><dd>{new Date(client.updated_at).toLocaleDateString()}</dd></div>
              <div className="p7-detail-row"><dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{client.notes || "No notes"}</dd></div>
            </dl>
          </Card>

          <Card data-testid="client-edit-panel">
            <SectionHeader title="Edit Client" />
            <ClientForm
              mode="edit"
              actionUrl={`/api/v1/clients/${client.id}`}
              cancelHref={`/app/clients/${client.id}`}
              clientId={client.id}
              initialValues={{
                name: client.name,
                email: client.email ?? "",
                phone: client.phone ?? "",
                notes: client.notes ?? "",
                company_name: client.company_name ?? "",
                address_line1: client.address_line1 ?? "",
                city: client.city ?? "",
                state: client.state ?? "",
                zip: client.zip ?? "",
              }}
            />
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
