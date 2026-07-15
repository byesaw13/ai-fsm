import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { LinkedDocuments } from "@/components/documents/LinkedDocuments";
import { canCreateEstimates, canManageClients, canTransitionJob } from "@/lib/auth/permissions";
import { query, queryOne } from "@/lib/db";
import { buildJobCreateHref, formatClientContact, formatPropertyAddress } from "@/lib/crm/normalization";
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
  relationship_type?: string | null;
  travel_rule?: string | null;
  custom_included_one_way_miles?: number | string | null;
  custom_mileage_rate_cents?: number | null;
  custom_travel_time_rate_cents?: number | null;
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

  const [properties, activeJobs, activityEvents, estimates, invoices, openAssessments, vaultItems] = await Promise.all([
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
                CASE v.visit_type
                  WHEN 'site_visit' THEN 'Assessment: ' || COALESCE(j.title, 'Project')
                  WHEN 'standard' THEN 'Work day: ' || COALESCE(j.title, 'Project')
                  ELSE COALESCE(j.title, 'Visit')
                END AS label,
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
    query<{
      id: string;
      scheduled_start: string;
      status: string;
      job_id: string;
      job_title: string | null;
      assessment_completed: boolean;
    }>(
      `SELECT v.id, v.scheduled_start::text, v.status, v.job_id,
              j.title AS job_title,
              (sva.completed_at IS NOT NULL) AS assessment_completed
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       LEFT JOIN site_visit_assessments sva ON sva.visit_id = v.id AND sva.account_id = v.account_id
       WHERE j.client_id = $1 AND v.account_id = $2
         AND v.visit_type = 'site_visit'
         AND v.status NOT IN ('completed', 'cancelled')
       ORDER BY v.scheduled_start ASC
       LIMIT 10`,
      [id, session.accountId],
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
  const outstandingInvoice = invoices.find((i) => ["draft", "sent", "partial", "overdue"].includes(i.status)) ?? null;
  const openEstimate = estimates.find((e) => ["draft", "sent", "approved"].includes(e.status)) ?? null;
  const recentHistory = activityEvents.filter((e) => !["draft", "sent", "scheduled", "arrived", "in_progress", "partial", "overdue"].includes(String(e.status))).slice(0, 3);
  const historicalEstimates = estimates.filter((e) => !["draft", "sent", "approved"].includes(e.status));
  const historicalInvoices = invoices.filter((i) => !["draft", "sent", "partial", "overdue"].includes(i.status));

  const rightNowItems = [
    ...openAssessments.map((a) => ({
      key: `a-${a.id}`,
      href: a.assessment_completed ? `/app/visits/${a.id}` : `/app/visits/${a.id}/assessment`,
      title: a.assessment_completed ? "Assessment — close visit" : "Assessment — finish form",
      meta: `${a.job_title ?? "Project"} · ${new Date(a.scheduled_start).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
      status: a.status,
      priority: 0 as number,
    })),
    ...activeJobs.map((j) => ({
      key: `j-${j.id}`,
      href: `/app/jobs/${j.id}`,
      title: j.title,
      meta: [j.property_address, j.next_visit_start
        ? `Next: ${new Date(j.next_visit_start).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : null].filter(Boolean).join(" · ") || "Active project",
      status: j.status,
      priority: 1 as number,
    })),
    ...(openEstimate
      ? [{
          key: `e-${openEstimate.id}`,
          href: `/app/estimates/${openEstimate.id}`,
          title: `Estimate · ${openEstimate.status}`,
          meta: `${openEstimate.job_title ?? "Estimate"} · ${dollars(openEstimate.total_cents)}`,
          status: openEstimate.status,
          priority: 2 as number,
        }]
      : []),
    ...(outstandingInvoice
      ? [{
          key: `i-${outstandingInvoice.id}`,
          href: `/app/invoices/${outstandingInvoice.id}`,
          title: outstandingInvoice.status === "overdue" ? "Invoice overdue" : "Invoice open",
          meta: `${outstandingInvoice.job_title ?? "Invoice"} · ${dollars(outstandingInvoice.balance_cents)} due`,
          status: outstandingInvoice.status,
          priority: 2 as number,
        }]
      : []),
  ].sort((a, b) => a.priority - b.priority);

  return (
    <PageContainer>
      <PageHeader
        title={client.name}
        subtitle={formatClientContact(client)}
        backHref="/app/clients"
        backLabel="Clients"
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
            {client.phone ? (
              <>
                <a href={`tel:${client.phone}`} className="p7-btn p7-btn-primary p7-btn-sm" style={{ textDecoration: "none" }}>
                  Call
                </a>
                <a href={`sms:${client.phone}`} className="p7-btn p7-btn-secondary p7-btn-sm" style={{ textDecoration: "none" }}>
                  Text
                </a>
              </>
            ) : null}
            {client.email ? (
              <a href={`mailto:${client.email}`} className="p7-btn p7-btn-secondary p7-btn-sm" style={{ textDecoration: "none" }}>
                Email
              </a>
            ) : null}
            <CopyPortalLinkButton url={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/${client.portal_token}`} label="Portal" />
            {canCreateJobs ? <LinkButton href={buildJobCreateHref(client.id)} variant="secondary" size="sm">+ Project</LinkButton> : null}
          </div>
        }
      />

      {/* Right now — only real open items, no empty-state grid noise */}
      <Card data-testid="client-right-now">
        <SectionHeader title="Right now" />
        {rightNowItems.length === 0 ? (
          <EmptyState
            title="Nothing open"
            description="No active projects, assessments, estimates, or invoices for this customer."
          />
        ) : (
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {rightNowItems.map((item) => (
              <ItemCard
                key={item.key}
                href={item.href}
                title={item.title}
                meta={<span>{item.meta}</span>}
                titleBadge={
                  <StatusBadge variant={item.status as StatusVariant}>
                    {item.status.replaceAll("_", " ")}
                  </StatusBadge>
                }
                overdue={item.status === "overdue"}
              />
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
          {canCreateEstimate ? (
            <LinkButton href={`/app/estimates/new?client_id=${client.id}`} variant="ghost" size="sm">
              + Estimate
            </LinkButton>
          ) : null}
          <LinkButton href={`/app/properties/new?client_id=${client.id}`} variant="ghost" size="sm">
            + Property
          </LinkButton>
          {canCreateJobs ? (
            <LinkButton href={buildJobCreateHref(client.id)} variant="ghost" size="sm">
              + Project
            </LinkButton>
          ) : null}
        </div>
      </Card>

      <div className="p7-detail-layout" style={{ marginTop: "var(--space-4)" }}>
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader
              title="Properties"
              count={properties.length}
              action={
                <LinkButton href={`/app/properties/new?client_id=${client.id}`} variant="ghost" size="sm">
                  Add
                </LinkButton>
              }
            />
            {properties.length === 0 ? (
              <EmptyState title="No properties yet" description="Add the service address so visits and estimates land in the right place." />
            ) : (
              <div>
                {properties.map((property) => (
                  <ItemCard
                    key={property.id}
                    href={`/app/properties/${property.id}`}
                    title={property.name?.trim() || property.address}
                    meta={
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {formatPropertyAddress(property)}
                        {Number(property.open_job_count) > 0 ? ` · ${property.open_job_count} active` : ""}
                        {property.last_service_date
                          ? ` · last service ${new Date(property.last_service_date).toLocaleDateString()}`
                          : ""}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </Card>

          {recentHistory.length > 0 ? (
            <Card>
              <SectionHeader title="Recent activity" count={recentHistory.length} />
              <ClientActivityTimeline events={recentHistory} />
            </Card>
          ) : null}

          <Disclosure title="Full history" count={activityEvents.length}>
            {activityEvents.length === 0 ? (
              <EmptyState title="No history yet" description="Visits, estimates, and invoices appear here over time." />
            ) : (
              <ClientActivityTimeline events={activityEvents} />
            )}
          </Disclosure>

          {(vaultItems.length > 0 || historicalEstimates.length > 0 || historicalInvoices.length > 0) && (
            <>
              {vaultItems.length > 0 ? (
                <Disclosure title="Vault" count={vaultItems.length}>
                  <div>
                    {vaultItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        href={`/app/properties/${item.property_id}`}
                        title={item.name}
                        meta={
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            {VAULT_CATEGORY_LABELS[item.category] ?? item.category} · {item.property_address}
                            {Number(item.photo_count) > 0 ? ` · ${item.photo_count} photos` : ""}
                          </span>
                        }
                      />
                    ))}
                  </div>
                </Disclosure>
              ) : null}
              {historicalEstimates.length > 0 ? (
                <Disclosure title="Closed estimates" count={historicalEstimates.length}>
                  <div>
                    {historicalEstimates.map((estimate) => (
                      <ItemCard
                        key={estimate.id}
                        href={`/app/estimates/${estimate.id}`}
                        title={estimate.job_title ?? "Estimate"}
                        meta={<span>{estimate.status} · {dollars(estimate.total_cents)}</span>}
                      />
                    ))}
                  </div>
                </Disclosure>
              ) : null}
              {historicalInvoices.length > 0 ? (
                <Disclosure title="Paid / closed invoices" count={historicalInvoices.length}>
                  <div>
                    {historicalInvoices.map((invoice) => (
                      <ItemCard
                        key={invoice.id}
                        href={`/app/invoices/${invoice.id}`}
                        title={invoice.job_title ?? "Invoice"}
                        meta={<span>{invoice.status} · {dollars(invoice.total_cents)}</span>}
                      />
                    ))}
                  </div>
                </Disclosure>
              ) : null}
            </>
          )}
        </div>

        <div className="p7-detail-sidebar">
          <Card>
            <SectionHeader title="Contact" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row"><dt>Phone</dt><dd>{client.phone ? <a href={`tel:${client.phone}`}>{client.phone}</a> : "—"}</dd></div>
              <div className="p7-detail-row"><dt>Email</dt><dd>{client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : "—"}</dd></div>
              <div className="p7-detail-row"><dt>Company</dt><dd>{client.company_name || "—"}</dd></div>
              <div className="p7-detail-row"><dt>Billing address</dt><dd>{client.address_line1 || "—"}</dd></div>
              <div className="p7-detail-row"><dt>City / State / ZIP</dt><dd>{[client.city, client.state, client.zip].filter(Boolean).join(" ") || "—"}</dd></div>
              {client.notes ? (
                <div className="p7-detail-row"><dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{client.notes}</dd></div>
              ) : null}
            </dl>
          </Card>

          <Disclosure title="Travel & relationship settings">
            <dl className="p7-detail-list">
              <div className="p7-detail-row"><dt>Customer type</dt><dd>{client.relationship_type ?? "standard"}</dd></div>
              <div className="p7-detail-row"><dt>Travel rule</dt><dd>{client.travel_rule ?? "standard_policy"}</dd></div>
              {client.travel_rule === "custom_included_radius" && client.custom_included_one_way_miles != null ? (
                <div className="p7-detail-row">
                  <dt>Included one-way miles</dt>
                  <dd>{client.custom_included_one_way_miles}</dd>
                </div>
              ) : null}
              {client.travel_rule === "custom_mileage_rate" && client.custom_mileage_rate_cents != null ? (
                <div className="p7-detail-row">
                  <dt>Custom mileage rate</dt>
                  <dd>${(Number(client.custom_mileage_rate_cents) / 100).toFixed(2)}/mi</dd>
                </div>
              ) : null}
              {client.travel_rule === "custom_travel_time_rate" && client.custom_travel_time_rate_cents != null ? (
                <div className="p7-detail-row">
                  <dt>Custom travel-time rate</dt>
                  <dd>${(Number(client.custom_travel_time_rate_cents) / 100).toFixed(2)}/hr</dd>
                </div>
              ) : null}
            </dl>
          </Disclosure>

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
                relationship_type: (client.relationship_type as
                  | "standard"
                  | "realtor"
                  | "preferred"
                  | "referral_partner"
                  | undefined) ?? "standard",
                travel_rule: (client.travel_rule as
                  | "standard_policy"
                  | "mileage_waived"
                  | "travel_time_waived"
                  | "all_travel_waived"
                  | "custom_included_radius"
                  | "custom_mileage_rate"
                  | "custom_travel_time_rate"
                  | "minimum_project_value_exemption"
                  | "manual_review_required"
                  | undefined) ?? "standard_policy",
                custom_included_one_way_miles:
                  client.custom_included_one_way_miles != null
                    ? String(client.custom_included_one_way_miles)
                    : "",
                custom_mileage_rate_dollars:
                  client.custom_mileage_rate_cents != null
                    ? (Number(client.custom_mileage_rate_cents) / 100).toFixed(2)
                    : "",
                custom_travel_time_rate_dollars:
                  client.custom_travel_time_rate_cents != null
                    ? (Number(client.custom_travel_time_rate_cents) / 100).toFixed(2)
                    : "",
              }}
            />
          </Disclosure>

          <LinkedDocuments session={session} entityType="client" entityId={client.id} />
        </div>
      </div>
    </PageContainer>
  );
}
