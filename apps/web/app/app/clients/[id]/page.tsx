import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates, canManageClients, canTransitionJob } from "@/lib/auth/permissions";
import { query, queryOne } from "@/lib/db";
import { buildJobCreateHref, formatClientContact, formatPropertyAddress } from "@/lib/crm/p7";
import {
  Card,
  EmptyState,
  ItemCard,
  LinkButton,
  PageContainer,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { ClientForm } from "../ClientForm";
import { ClientActivityTimeline } from "./ClientActivityTimeline";
import type { ActivityEvent } from "./ClientActivityTimeline";
import { dollars } from "./client360-helpers";
import { CopyPortalLinkButton } from "@/components/CopyPortalLinkButton";
import { VAULT_CATEGORY_LABELS } from "@ai-fsm/domain";
import type { VaultCategory } from "@ai-fsm/domain";

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
  portal_token: string;
  created_at: string;
  updated_at: string;
};

type PropertyRow = {
  id: string;
  name: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  open_job_count: number | string;
  last_service_date: string | null;
};

type ActiveJobRow = {
  id: string;
  title: string;
  status: string;
  property_address: string | null;
  next_visit_id: string | null;
  next_visit_start: string | null;
  next_visit_status: string | null;
};

type EstimateRow = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  job_title: string | null;
};

type InvoiceRow = {
  id: string;
  status: string;
  total_cents: number;
  balance_cents: number;
  due_date: string | null;
  created_at: string;
  job_title: string | null;
};

type VaultItemRow = {
  id: string;
  name: string;
  category: VaultCategory;
  property_id: string;
  property_address: string;
  created_at: string;
  photo_count: number | string;
};

function Disclosure({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", padding: "var(--space-3)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 800, display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <span>{title}</span>
        {typeof count === "number" ? <span className="ops-section-count">{count}</span> : null}
      </summary>
      <div style={{ marginTop: "var(--space-3)" }}>{children}</div>
    </details>
  );
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const client = await queryOne<ClientRow>(
    `SELECT c.*
     FROM clients c
     WHERE c.id = $1 AND c.account_id = $2`,
    [id, session.accountId]
  );
  if (!client) notFound();

  const [properties, activeJobs, activityEvents, estimates, invoices, vaultItems] = await Promise.all([
    query<PropertyRow>(
      `SELECT p.id, p.name, p.address, p.city, p.state, p.zip,
              (SELECT COUNT(*) FROM jobs j
               WHERE j.property_id = p.id AND j.account_id = p.account_id
                 AND j.status IN ('draft','quoted','scheduled','in_progress')) AS open_job_count,
              (SELECT MAX(v.completed_at) FROM visits v
               JOIN jobs j ON j.id = v.job_id
               WHERE j.property_id = p.id AND v.account_id = p.account_id
                 AND v.status = 'completed') AS last_service_date
       FROM properties p
       WHERE p.client_id = $1 AND p.account_id = $2
       ORDER BY p.created_at DESC
       LIMIT 10`,
      [id, session.accountId]
    ),
    query<ActiveJobRow>(
      `SELECT j.id, j.title, j.status,
              p.address AS property_address,
              v.id AS next_visit_id,
              v.scheduled_start::text AS next_visit_start,
              v.status AS next_visit_status
       FROM jobs j
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN LATERAL (
         SELECT id, scheduled_start, status
         FROM visits
         WHERE job_id = j.id AND status IN ('scheduled','arrived','in_progress')
         ORDER BY scheduled_start ASC NULLS LAST
         LIMIT 1
       ) v ON true
       WHERE j.client_id = $1 AND j.account_id = $2
         AND j.status IN ('draft','quoted','scheduled','in_progress')
       ORDER BY CASE j.status
         WHEN 'in_progress' THEN 1
         WHEN 'scheduled' THEN 2
         WHEN 'quoted' THEN 3
         WHEN 'draft' THEN 4
         ELSE 5
       END, j.created_at DESC
       LIMIT 5`,
      [id, session.accountId]
    ),
    query<ActivityEvent>(
      `SELECT event_type, id, ts, label, status, link_id, total_cents, property_address FROM (
         SELECT 'visit'::text AS event_type, v.id,
                COALESCE(v.completed_at, v.scheduled_start) AS ts,
                COALESCE(j.title, 'Visit') AS label,
                v.status, v.id AS link_id, NULL::int AS total_cents,
                p.address AS property_address
         FROM visits v
         JOIN jobs j ON j.id = v.job_id
         LEFT JOIN properties p ON p.id = j.property_id
         WHERE j.client_id = $1 AND v.account_id = $2
         UNION ALL
         SELECT 'estimate'::text, e.id, COALESCE(e.sent_at, e.created_at),
                COALESCE(j.title, 'Estimate'), e.status, e.id, e.total_cents,
                p.address AS property_address
         FROM estimates e
         LEFT JOIN jobs j ON j.id = e.job_id
         LEFT JOIN properties p ON p.id = COALESCE(e.property_id, j.property_id)
         WHERE e.client_id = $1 AND e.account_id = $2 AND e.status != 'draft'
         UNION ALL
         SELECT 'invoice'::text, i.id, COALESCE(i.sent_at, i.created_at),
                COALESCE(j.title, 'Invoice'), i.status, i.id, i.total_cents,
                p.address AS property_address
         FROM invoices i
         LEFT JOIN jobs j ON j.id = i.job_id
         LEFT JOIN properties p ON p.id = COALESCE(i.property_id, j.property_id)
         WHERE i.client_id = $1 AND i.account_id = $2 AND i.status != 'draft'
       ) t ORDER BY ts DESC LIMIT 50`,
      [id, session.accountId]
    ),
    query<EstimateRow>(
      `SELECT e.id, e.status, e.total_cents, e.created_at, j.title AS job_title
       FROM estimates e
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.client_id = $1 AND e.account_id = $2
       ORDER BY e.created_at DESC
       LIMIT 20`,
      [id, session.accountId]
    ),
    query<InvoiceRow>(
      `SELECT i.id, i.status, i.total_cents, i.balance_cents, i.due_date, i.created_at, j.title AS job_title
       FROM invoices i
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.client_id = $1 AND i.account_id = $2
       ORDER BY i.created_at DESC
       LIMIT 20`,
      [id, session.accountId]
    ),
    query<VaultItemRow>(
      `SELECT pvi.id, pvi.name, pvi.category,
              p.id AS property_id, p.address AS property_address,
              pvi.created_at,
              COUNT(pvim.id)::int AS photo_count
       FROM property_vault_items pvi
       JOIN properties p ON p.id = pvi.property_id
       LEFT JOIN property_vault_item_media pvim ON pvim.vault_item_id = pvi.id
       WHERE p.client_id = $1 AND pvi.account_id = $2
       GROUP BY pvi.id, pvi.name, pvi.category, p.id, p.address, pvi.created_at
       ORDER BY pvi.created_at DESC
       LIMIT 20`,
      [id, session.accountId]
    ),
  ]);

  const canCreateJobs = canTransitionJob(session.role);
  const canCreateEstimate = canCreateEstimates(session.role);
  const currentJob = activeJobs[0] ?? null;
  const outstandingInvoice = invoices.find((i) => ["draft", "sent", "partial", "overdue"].includes(i.status)) ?? null;
  const upcomingVisitJob = activeJobs.find((j) => j.next_visit_id) ?? null;
  const openEstimate = estimates.find((e) => ["draft", "sent", "approved"].includes(e.status)) ?? null;
  const recentHistory = activityEvents.filter((e) => !["draft", "sent", "scheduled", "arrived", "in_progress", "partial", "overdue"].includes(String(e.status))).slice(0, 3);
  const historicalEstimates = estimates.filter((e) => !["draft", "sent", "approved"].includes(e.status));
  const historicalInvoices = invoices.filter((i) => !["draft", "sent", "partial", "overdue"].includes(i.status));

  return (
    <PageContainer>
      <PageHeader
        title={client.name}
        subtitle={formatClientContact(client)}
        backHref="/app/clients"
        backLabel="Clients"
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
            <CopyPortalLinkButton url={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/${client.portal_token}`} label="Copy portal link" />
            <LinkButton href={`/app/properties/new?client_id=${client.id}`} variant="secondary" size="sm">+ Property</LinkButton>
            {canCreateEstimate ? <LinkButton href={`/app/estimates/new?client_id=${client.id}`} variant="secondary" size="sm">+ Estimate</LinkButton> : null}
            {canCreateJobs ? <LinkButton href={buildJobCreateHref(client.id)} variant="primary" size="sm">+ Job</LinkButton> : null}
          </div>
        }
      />

      <Card>
        <SectionHeader title="Operations" />
        <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {currentJob ? (
            <ItemCard
              href={`/app/jobs/${currentJob.id}`}
              title="Current Job"
              meta={<span>{currentJob.title}</span>}
              titleBadge={<StatusBadge variant={currentJob.status as StatusVariant}>{currentJob.status.replaceAll("_", " ")}</StatusBadge>}
            />
          ) : <EmptyState title="No current job" description="No active job is open for this customer." />}
          {outstandingInvoice ? (
            <ItemCard
              href={`/app/invoices/${outstandingInvoice.id}`}
              title="Outstanding Invoice"
              meta={<span>{outstandingInvoice.job_title ?? "Invoice"} · {dollars(outstandingInvoice.balance_cents)} due</span>}
              overdue={outstandingInvoice.status === "overdue"}
            />
          ) : <EmptyState title="No outstanding invoice" description="No active invoice is open for this customer." />}
          {upcomingVisitJob?.next_visit_id ? (
            <ItemCard
              href={`/app/visits/${upcomingVisitJob.next_visit_id}`}
              title="Upcoming Visit"
              meta={<span>{upcomingVisitJob.next_visit_start ? new Date(upcomingVisitJob.next_visit_start).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Scheduled"} · {upcomingVisitJob.title}</span>}
            />
          ) : <EmptyState title="No upcoming visit" description="No active visit is scheduled for this customer." />}
          {openEstimate ? (
            <ItemCard
              href={`/app/estimates/${openEstimate.id}`}
              title="Open Estimate"
              meta={<span>{openEstimate.job_title ?? "Estimate"} · {dollars(openEstimate.total_cents)}</span>}
              titleBadge={<StatusBadge variant={openEstimate.status as StatusVariant}>{openEstimate.status}</StatusBadge>}
            />
          ) : <EmptyState title="No open estimate" description="No active estimate is open for this customer." />}
        </div>
      </Card>

      <div className="p7-detail-layout" style={{ marginTop: "var(--space-4)" }}>
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader title="Properties" count={properties.length} action={<LinkButton href={`/app/properties/new?client_id=${client.id}`} variant="ghost" size="sm">Add Property</LinkButton>} />
            {properties.length === 0 ? <EmptyState title="No properties yet" description="Create a property to track service locations for this customer." /> : (
              <div>
                {properties.slice(0, 5).map((property) => (
                  <ItemCard
                    key={property.id}
                    href={`/app/properties/${property.id}`}
                    title={property.name?.trim() || property.address}
                    meta={<span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{formatPropertyAddress(property)}{Number(property.open_job_count) > 0 ? ` · ${property.open_job_count} active` : ""}</span>}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="Recent History" count={recentHistory.length} />
            {recentHistory.length === 0 ? <EmptyState title="No recent history" description="Completed work appears here after operations close." /> : <ClientActivityTimeline events={recentHistory} />}
          </Card>

          <Disclosure title="Full History" count={activityEvents.length}>
            <ClientActivityTimeline events={activityEvents} />
          </Disclosure>

          <Disclosure title="Vault" count={vaultItems.length}>
            {vaultItems.length === 0 ? <EmptyState title="Vault is empty" description="Property documents and photos appear here after they are captured." /> : (
              <div>
                {vaultItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    href={`/app/properties/${item.property_id}`}
                    title={item.name}
                    meta={<span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{VAULT_CATEGORY_LABELS[item.category] ?? item.category} · {item.property_address}{Number(item.photo_count) > 0 ? ` · ${item.photo_count} photos` : ""}</span>}
                  />
                ))}
              </div>
            )}
          </Disclosure>

          <Disclosure title="Historical Estimates" count={historicalEstimates.length}>
            {historicalEstimates.length === 0 ? <EmptyState title="No historical estimates" description="Declined and expired estimates appear here." /> : (
              <div>{historicalEstimates.map((estimate) => <ItemCard key={estimate.id} href={`/app/estimates/${estimate.id}`} title={estimate.job_title ?? "Estimate"} meta={<span>{estimate.status} · {dollars(estimate.total_cents)}</span>} />)}</div>
            )}
          </Disclosure>

          <Disclosure title="Historical Invoices" count={historicalInvoices.length}>
            {historicalInvoices.length === 0 ? <EmptyState title="No historical invoices" description="Paid and void invoices appear here." /> : (
              <div>{historicalInvoices.map((invoice) => <ItemCard key={invoice.id} href={`/app/invoices/${invoice.id}`} title={invoice.job_title ?? "Invoice"} meta={<span>{invoice.status} · {dollars(invoice.total_cents)}</span>} />)}</div>
            )}
          </Disclosure>
        </div>

        <div className="p7-detail-sidebar">
          <Card>
            <SectionHeader title="Customer Details" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row"><dt>Name</dt><dd>{client.name}</dd></div>
              <div className="p7-detail-row"><dt>Company</dt><dd>{client.company_name || "-"}</dd></div>
              <div className="p7-detail-row"><dt>Email</dt><dd>{client.email || "-"}</dd></div>
              <div className="p7-detail-row"><dt>Phone</dt><dd>{client.phone || "-"}</dd></div>
              <div className="p7-detail-row"><dt>Address</dt><dd>{client.address_line1 || "-"}</dd></div>
              <div className="p7-detail-row"><dt>City / State / ZIP</dt><dd>{[client.city, client.state, client.zip].filter(Boolean).join(" ") || "-"}</dd></div>
              <div className="p7-detail-row"><dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{client.notes || "No notes"}</dd></div>
            </dl>
          </Card>

          <Disclosure title="Edit Customer">
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
          </Disclosure>
        </div>
      </div>
    </PageContainer>
  );
}
