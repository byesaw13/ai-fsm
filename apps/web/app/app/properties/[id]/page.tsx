import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canManageClients, canTransitionJob } from "@/lib/auth/permissions";
import { query, queryOne } from "@/lib/db";
import { buildJobCreateHref, formatPropertyAddress } from "@/lib/crm/p7";
import { computeVaultCompleteness, type VaultCategory } from "@ai-fsm/domain";
import {
  Card,
  EmptyState,
  ItemCard,
  LinkButton,
  MetricGrid,
  PageContainer,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import { PropertyForm } from "../PropertyForm";
import { PropertyVaultSection } from "../PropertyVaultSection";
import { PropertyTimeline } from "./PropertyTimeline";
import type { TimelineEvent } from "./PropertyTimeline";
import { PropertyConditionsPanel } from "./PropertyConditionsPanel";
import type { ConditionRow } from "./PropertyConditionsPanel";
import { PropertyIssuesPanel } from "./PropertyIssuesPanel";
import type { IssueRow } from "./PropertyIssuesPanel";

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

type VaultItemRow = {
  id: string; category: VaultCategory; name: string; location: string | null;
  manufacturer: string | null; model_number: string | null; serial_number: string | null;
  install_date: string | null; last_serviced_date: string | null; next_service_date: string | null;
  notes: string | null;
};

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

  const [clients, jobs, timelineEvents, vaultItems, conditions, issues] = await Promise.all([
    query<ClientOption>(`SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC`, [session.accountId]),
    query<JobRow>(
      `SELECT id, title, status, created_at
       FROM jobs
       WHERE property_id = $1 AND account_id = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [id, session.accountId]
    ),
    query<TimelineEvent>(
      `SELECT 'visit'::text AS event_type, v.id::text AS id,
              COALESCE(v.completed_at, v.scheduled_start) AS ts,
              COALESCE(j.title, 'Untitled job') AS label,
              v.status AS detail,
              v.id::text AS link_id,
              NULL::int AS total_cents
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       WHERE j.property_id = $1 AND v.account_id = $2

       UNION ALL

       SELECT 'estimate'::text, e.id::text,
              COALESCE(e.sent_at, e.created_at),
              'Estimate', e.status, e.id::text, e.total_cents
       FROM estimates e
       WHERE e.property_id = $1 AND e.account_id = $2 AND e.status != 'draft'

       UNION ALL

       SELECT 'invoice'::text, i.id::text,
              COALESCE(i.sent_at, i.created_at),
              COALESCE('Invoice ' || i.invoice_number, 'Invoice'), i.status,
              i.id::text, i.total_cents
       FROM invoices i
       WHERE i.property_id = $1 AND i.account_id = $2 AND i.status != 'draft'

       UNION ALL

       SELECT 'vault_item'::text, pvi.id::text, pvi.created_at,
              pvi.name, pvi.category::text, NULL::text, NULL::int
       FROM property_vault_items pvi
       WHERE pvi.property_id = $1 AND pvi.account_id = $2

       UNION ALL

       SELECT 'membership'::text, mp.id::text, mp.created_at,
              mp.name, mp.status, mp.id::text, NULL::int
       FROM maintenance_plans mp
       WHERE mp.property_id = $1 AND mp.account_id = $2

       ORDER BY ts DESC NULLS LAST
       LIMIT 50`,
      [id, session.accountId]
    ),
    query<VaultItemRow>(
      `SELECT id, category, name, location, manufacturer, model_number,
              serial_number, install_date, last_serviced_date, next_service_date, notes
       FROM property_vault_items
       WHERE property_id = $1 AND account_id = $2
       ORDER BY category ASC, name ASC`,
      [id, session.accountId]
    ),
    query<ConditionRow>(
      `SELECT DISTINCT ON (area)
         area, condition, note, assessed_at::text AS assessed_at, visit_id::text AS visit_id,
         '[]'::json AS trend
       FROM property_condition_snapshots
       WHERE account_id = $1 AND property_id = $2
       ORDER BY area, assessed_at DESC`,
      [session.accountId, id]
    ),
    query<IssueRow>(
      `SELECT id, area, item_key, title, description, status, severity,
              occurrence_count, first_noted_at::text AS first_noted_at,
              last_noted_at::text AS last_noted_at, auto_detected
       FROM property_issues
       WHERE account_id = $1 AND property_id = $2
         AND status IN ('open','monitoring')
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'moderate' THEN 3 ELSE 4 END,
         last_noted_at DESC`,
      [session.accountId, id]
    ),
  ]);

  const vaultCompleteness = computeVaultCompleteness(vaultItems);

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
          {
            label: "Vault",
            value: `${vaultCompleteness.percent}%`,
            sub:
              vaultCompleteness.percent === 100
                ? "All core categories logged"
                : `${vaultCompleteness.coveredCount}/${vaultCompleteness.totalCount} core categories logged`,
            variant: vaultCompleteness.percent === 100 ? "success" : "default",
          },
          { label: "Client", value: property.client_name, href: `/app/clients/${property.client_id}` },
        ]}
      />

      <div className="p7-detail-layout" style={{ marginTop: "var(--space-4)" }}>
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader title="Property Timeline" count={timelineEvents.length} />
            <PropertyTimeline events={timelineEvents} />
          </Card>

          {issues.length > 0 && (
            <Card>
              <SectionHeader title="Recurring Issues" count={issues.length} />
              <PropertyIssuesPanel issues={issues} propertyId={property.id} />
            </Card>
          )}

          <Card data-testid="property-vault-card">
            <SectionHeader title="Digital Home Vault" count={vaultItems.length} />
            <PropertyVaultSection
              propertyId={property.id}
              clientId={property.client_id}
              initialItems={vaultItems}
              canEdit={canManageClients(session.role)}
            />
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
            <SectionHeader title="Conditions" count={conditions.length} />
            <PropertyConditionsPanel conditions={conditions} />
          </Card>

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
