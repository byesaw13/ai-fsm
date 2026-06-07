import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { canManageClients, canTransitionJob, canCreateEstimates } from "@/lib/auth/permissions";
import { query, queryOne } from "@/lib/db";
import { buildJobCreateHref, formatPropertyAddress } from "@/lib/crm/p7";
import { computeVaultCompleteness, type VaultCategory } from "@ai-fsm/domain";
import {
  Card,
  EmptyState,
  ItemCard,
  LinkButton,
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
import { PropertyServiceHistory } from "./PropertyServiceHistory";
import type { ServiceHistoryRow } from "./PropertyServiceHistory";
import {
  propertyActiveJobStatusColor,
  formatPropertyCents,
  formatPropertyDate,
  NOTE_SOURCE_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "./property-history-helpers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  completed_visit_count: number | string;
};

type ClientOption = { id: string; name: string };

type ActiveJobRow = {
  id: string;
  title: string;
  status: string;
  next_visit_id: string | null;
  next_visit_start: string | null;
  next_visit_status: string | null;
};

type OpenEstimateRow = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  job_title: string | null;
};

type OpenInvoiceRow = {
  id: string;
  status: string;
  total_cents: number;
  balance_cents: number;
  job_title: string | null;
};

type VaultItemRow = {
  id: string;
  category: VaultCategory;
  name: string;
  location: string | null;
  manufacturer: string | null;
  model_number: string | null;
  serial_number: string | null;
  install_date: string | null;
  last_serviced_date: string | null;
  next_service_date: string | null;
  notes: string | null;
  photo_count: number;
};

type PropertyNoteRow = {
  id: string;
  source: string;
  body: string;
  pinned: boolean;
  visit_id: string | null;
  created_at: string;
};

type DocumentRow = {
  id: string;
  title: string | null;
  document_type: string;
  original_filename: string | null;
  created_at: string;
  entity_type: string;
};

type VisitMediaRow = {
  visit_id: string;
  job_title: string;
  visit_date: string;
  photo_count: number;
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  // Round 1: property summary (simplified — correlated subqueries removed).
  // Active work counts are derived from parallel queries in round 2.
  const property = await queryOne<PropertyRow>(
    `SELECT p.*, c.name AS client_name,
            COUNT(DISTINCT j.id)::int AS job_count,
            COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'completed')::int AS completed_visit_count
     FROM properties p
     JOIN clients c ON c.id = p.client_id AND c.account_id = p.account_id
     LEFT JOIN jobs j ON j.property_id = p.id AND j.account_id = p.account_id
     LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = p.account_id
     WHERE p.id = $1 AND p.account_id = $2
     GROUP BY p.id, c.name`,
    [id, session.accountId]
  );
  if (!property) notFound();

  // Round 2: all section data in parallel.
  const [
    clients,
    activeJobs,
    openEstimates,
    openInvoices,
    serviceHistory,
    timelineEvents,
    propertyNotes,
    documents,
    visitMedia,
    vaultItems,
    conditions,
    issues,
  ] = await Promise.all([

    // Edit form client dropdown
    query<ClientOption>(
      `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name ASC`,
      [session.accountId]
    ),

    // Active jobs — real DB status values (not pipeline stage names)
    query<ActiveJobRow>(
      `SELECT j.id, j.title, j.status,
              v.id AS next_visit_id,
              v.scheduled_start AS next_visit_start,
              v.status AS next_visit_status
       FROM jobs j
       LEFT JOIN LATERAL (
         SELECT id, scheduled_start, status
         FROM visits
         WHERE job_id = j.id AND status NOT IN ('completed','cancelled')
         ORDER BY scheduled_start ASC NULLS LAST
         LIMIT 1
       ) v ON true
       WHERE j.property_id = $1 AND j.account_id = $2
         AND j.status NOT IN ('completed','invoiced','cancelled')
       ORDER BY CASE j.status
         WHEN 'in_progress' THEN 1
         WHEN 'scheduled'   THEN 2
         WHEN 'quoted'      THEN 3
         WHEN 'draft'       THEN 4
         ELSE 5
       END, j.created_at DESC`,
      [id, session.accountId]
    ),

    // Open estimates (draft or sent)
    query<OpenEstimateRow>(
      `SELECT e.id, e.status, e.total_cents, e.created_at, j.title AS job_title
       FROM estimates e
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.property_id = $1 AND e.account_id = $2
         AND e.status IN ('draft','sent')
       ORDER BY e.created_at DESC
       LIMIT 10`,
      [id, session.accountId]
    ),

    // Outstanding invoices
    query<OpenInvoiceRow>(
      `SELECT i.id, i.status, i.total_cents, i.balance_cents, j.title AS job_title
       FROM invoices i
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.property_id = $1 AND i.account_id = $2
         AND i.status IN ('sent','partial','overdue')
       ORDER BY i.created_at DESC
       LIMIT 10`,
      [id, session.accountId]
    ),

    // Service history: completed/invoiced jobs with last visit + invoice info
    query<ServiceHistoryRow>(
      `SELECT j.id AS job_id, j.title AS job_title, j.status AS job_status,
              v.id AS last_visit_id,
              v.completed_at AS last_visit_date,
              LEFT(v.tech_notes, 200) AS tech_notes_preview,
              i.id AS invoice_id,
              i.total_cents AS invoice_total,
              i.paid_cents,
              i.status AS invoice_status
       FROM jobs j
       LEFT JOIN LATERAL (
         SELECT id, completed_at, tech_notes
         FROM visits
         WHERE job_id = j.id AND status = 'completed'
         ORDER BY completed_at DESC NULLS LAST
         LIMIT 1
       ) v ON true
       LEFT JOIN LATERAL (
         SELECT id, total_cents, paid_cents, status
         FROM invoices
         WHERE job_id = j.id AND account_id = j.account_id
           AND status NOT IN ('draft','void')
         ORDER BY created_at DESC
         LIMIT 1
       ) i ON true
       WHERE j.property_id = $1 AND j.account_id = $2
         AND j.status IN ('completed','invoiced')
       ORDER BY COALESCE(v.completed_at, j.created_at) DESC
       LIMIT 15`,
      [id, session.accountId]
    ),

    // Unified property timeline — sourced from property_timeline_v (single source of truth).
    // Covers: visit, estimate, invoice, vault_item, photo, issue, note, membership.
    query<TimelineEvent>(
      `SELECT event_type,
              entity_id::text          AS id,
              occurred_at              AS ts,
              summary                  AS label,
              COALESCE(detail, '')     AS detail,
              link_id,
              total_cents
       FROM property_timeline_v
       WHERE account_id = $2
         AND property_id = $1
       ORDER BY occurred_at DESC NULLS LAST
       LIMIT 60`,
      [id, session.accountId]
    ),

    // Property notes for the Health section
    query<PropertyNoteRow>(
      `SELECT id, source, body, pinned, visit_id::text AS visit_id, created_at
       FROM property_notes
       WHERE property_id = $1 AND account_id = $2
       ORDER BY pinned DESC, created_at DESC
       LIMIT 20`,
      [id, session.accountId]
    ),

    // Documents linked to this property or its jobs/estimates/invoices
    query<DocumentRow>(
      `WITH property_entities AS (
         SELECT id, 'job'::text      AS etype FROM jobs      WHERE property_id = $1 AND account_id = $2
         UNION ALL
         SELECT id, 'estimate'::text          FROM estimates  WHERE property_id = $1 AND account_id = $2
         UNION ALL
         SELECT id, 'invoice'::text           FROM invoices   WHERE property_id = $1 AND account_id = $2
         UNION ALL
         SELECT $1::uuid, 'property'::text
       )
       SELECT dl.id, dl.title, dl.document_type, dl.original_filename, dl.created_at, dl.entity_type
       FROM document_links dl
       JOIN property_entities pe ON pe.id = dl.entity_id AND pe.etype = dl.entity_type
       WHERE dl.account_id = $2 AND NOT COALESCE(dl.is_archived, false)
       ORDER BY dl.created_at DESC
       LIMIT 20`,
      [id, session.accountId]
    ),

    // Visit photo counts — which visits have before/after media attached
    query<VisitMediaRow>(
      `SELECT v.id AS visit_id,
              COALESCE(j.title, 'Visit') AS job_title,
              COALESCE(v.completed_at, v.scheduled_start) AS visit_date,
              COUNT(vm.id)::int AS photo_count
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       JOIN visit_media vm ON vm.visit_id = v.id AND vm.account_id = $2
       WHERE j.property_id = $1
       GROUP BY v.id, j.title, v.completed_at, v.scheduled_start
       HAVING COUNT(vm.id) > 0
       ORDER BY COALESCE(v.completed_at, v.scheduled_start) DESC NULLS LAST
       LIMIT 10`,
      [id, session.accountId]
    ),

    // Vault items with photo counts (unchanged)
    query<VaultItemRow>(
      `SELECT pvi.id, pvi.category, pvi.name, pvi.location, pvi.manufacturer, pvi.model_number,
              pvi.serial_number, pvi.install_date, pvi.last_serviced_date, pvi.next_service_date,
              pvi.notes, COALESCE(COUNT(m.id), 0)::int AS photo_count
       FROM property_vault_items pvi
       LEFT JOIN property_vault_item_media m ON m.vault_item_id = pvi.id AND m.account_id = pvi.account_id
       WHERE pvi.property_id = $1 AND pvi.account_id = $2
       GROUP BY pvi.id
       ORDER BY pvi.category ASC, pvi.name ASC`,
      [id, session.accountId]
    ),

    // Conditions — most recent reading per area
    query<ConditionRow>(
      `SELECT DISTINCT ON (area)
         area, condition, note, assessed_at::text AS assessed_at, visit_id::text AS visit_id,
         '[]'::json AS trend
       FROM property_condition_snapshots
       WHERE account_id = $2 AND property_id = $1
       ORDER BY area, assessed_at DESC`,
      [id, session.accountId]
    ),

    // All issues (including resolved — panel groups them internally)
    query<IssueRow>(
      `SELECT id, area, item_key, title, description, status, severity,
              occurrence_count, first_noted_at::text AS first_noted_at,
              last_noted_at::text AS last_noted_at, auto_detected
       FROM property_issues
       WHERE account_id = $2 AND property_id = $1
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'moderate' THEN 3 ELSE 4 END,
         last_noted_at DESC`,
      [id, session.accountId]
    ),
  ]);

  // Derived values
  const vaultCompleteness = computeVaultCompleteness(vaultItems);
  const activeWorkCount = activeJobs.length + openEstimates.length + openInvoices.length;
  const hasDocumentsOrMedia = documents.length > 0 || visitMedia.length > 0;
  const pinnedNotes = propertyNotes.filter((n) => n.pinned);
  const recentNotes = propertyNotes.filter((n) => !n.pinned);
  const hasHealth = issues.length > 0 || conditions.length > 0 || propertyNotes.length > 0;

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
            {canCreateEstimates(session.role) && (
              <LinkButton
                href={`/app/estimates/new?client_id=${property.client_id}&property_id=${property.id}`}
                variant="secondary"
                size="sm"
              >
                + Estimate
              </LinkButton>
            )}
            {canTransitionJob(session.role) && (
              <LinkButton
                href={buildJobCreateHref(property.client_id, property.id)}
                variant="primary"
                size="sm"
                data-testid="create-job-from-property-btn"
              >
                + Job
              </LinkButton>
            )}
          </div>
        }
      />

      <div className="p7-detail-layout" style={{ marginTop: "var(--space-4)" }}>
        <div className="p7-detail-primary">

          {/* ── Active Work ──────────────────────────────────────────────── */}
          <Card>
              <SectionHeader title="Operations" count={activeWorkCount} />

              {activeJobs.length > 0 && (
                <div style={{ marginBottom: openEstimates.length > 0 || openInvoices.length > 0 ? "var(--space-3)" : 0 }}>
                  {activeJobs.slice(0, 2).map((job) => {
                    const color = propertyActiveJobStatusColor(job.status);
                    const nextLabel = job.next_visit_start
                      ? `Next visit ${new Date(job.next_visit_start).toLocaleDateString([], { month: "short", day: "numeric" })}`
                      : "No visit scheduled";
                    return (
                      <ItemCard
                        key={job.id}
                        href={`/app/jobs/${job.id}`}
                        title={job.title}
                        titleBadge={
                          <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color, background: `${color}18`, padding: "1px 7px", borderRadius: 99 }}>
                            {job.status.replaceAll("_", " ")}
                          </span>
                        }
                        meta={
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            {nextLabel}
                          </span>
                        }
                      />
                    );
                  })}
                </div>
              )}

              {openEstimates.length > 0 && (
                <>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", padding: "var(--space-1) 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Estimates
                  </div>
                  {openEstimates.slice(0, 1).map((e) => (
                    <ItemCard
                      key={e.id}
                      href={`/app/estimates/${e.id}`}
                      title={e.job_title ?? "Estimate"}
                      meta={
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className={`p7-badge p7-badge-status-${e.status}`}>{e.status}</span>
                          <span style={{ fontSize: "var(--text-xs)" }}>{formatPropertyCents(e.total_cents)}</span>
                        </div>
                      }
                    />
                  ))}
                </>
              )}

              {openInvoices.length > 0 && (
                <>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", padding: "var(--space-1) 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Outstanding Invoices
                  </div>
                  {openInvoices.slice(0, 2).map((inv) => (
                    <ItemCard
                      key={inv.id}
                      href={`/app/invoices/${inv.id}`}
                      title={inv.job_title ?? "Invoice"}
                      overdue={inv.status === "overdue"}
                      meta={
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className={`p7-badge p7-badge-status-${inv.status}`}>{inv.status}</span>
                          <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: inv.status === "overdue" ? "#dc2626" : "inherit" }}>
                            {formatPropertyCents(inv.balance_cents)} due
                          </span>
                        </div>
                      }
                    />
                  ))}
                </>
              )}
              {activeWorkCount === 0 && (
                <EmptyState title="No active operations" description="Open jobs, upcoming visits, open estimates, and outstanding invoices appear here." />
              )}
            </Card>

          {/* ── Service History ──────────────────────────────────────────── */}
          {serviceHistory.length > 0 && (
            <Card>
              <SectionHeader title="Recent History" count={Math.min(serviceHistory.length, 3)} />
              <PropertyServiceHistory rows={serviceHistory.slice(0, 3)} />
            </Card>
          )}

          {/* ── Full History ─────────────────────────────────────────────── */}
          <Disclosure title="Full History" count={timelineEvents.length}>
            <PropertyTimeline events={timelineEvents} />
          </Disclosure>

          {/* ── Property Health ──────────────────────────────────────────── */}
          {hasHealth && (
            <Card>
              <SectionHeader title="Property Health" />

              {pinnedNotes.length > 0 && (
                <div style={{ marginBottom: "var(--space-4)" }}>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
                    Pinned Notes
                  </div>
                  {pinnedNotes.map((note) => (
                    <div
                      key={note.id}
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        borderRadius: "var(--radius-md)",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        marginBottom: "var(--space-2)",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      <div style={{ marginBottom: 4 }}>{note.body}</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {NOTE_SOURCE_LABELS[note.source] ?? note.source} · {formatPropertyDate(note.created_at)}
                        {note.visit_id && (
                          <> · <a href={`/app/visits/${note.visit_id}`} style={{ color: "inherit", textDecoration: "underline" }}>Visit</a></>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {issues.length > 0 && (
                <div style={{ marginBottom: "var(--space-4)" }}>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
                    Issues
                  </div>
                  <PropertyIssuesPanel issues={issues} propertyId={property.id} />
                </div>
              )}

              {conditions.length > 0 && (
                <div style={{ marginBottom: recentNotes.length > 0 ? "var(--space-4)" : 0 }}>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
                    Conditions
                  </div>
                  <PropertyConditionsPanel conditions={conditions} />
                </div>
              )}

              {recentNotes.length > 0 && (
                <div>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
                    Field Notes
                  </div>
                  {recentNotes.map((note) => (
                    <div
                      key={note.id}
                      style={{
                        padding: "var(--space-2) 0",
                        borderBottom: "1px solid var(--border)",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      <div style={{ marginBottom: 4 }}>{note.body.length > 200 ? `${note.body.slice(0, 197)}…` : note.body}</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {NOTE_SOURCE_LABELS[note.source] ?? note.source} · {formatPropertyDate(note.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!issues.length && !conditions.length && !propertyNotes.length && (
                <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  No health data recorded yet. Conditions and issues are captured during visits.
                </p>
              )}
            </Card>
          )}

          {/* ── Documents & Media ────────────────────────────────────────── */}
          {hasDocumentsOrMedia && (
            <Disclosure title="Documents & Media" count={documents.length + visitMedia.length}>

              {documents.length > 0 && (
                <div style={{ marginBottom: visitMedia.length > 0 ? "var(--space-4)" : 0 }}>
                  {visitMedia.length > 0 && (
                    <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
                      Documents
                    </div>
                  )}
                  {documents.map((doc) => (
                    <ItemCard
                      key={doc.id}
                      title={doc.title || doc.original_filename || "Document"}
                      meta={
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span className="p7-badge p7-badge-count">
                            {DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                          </span>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            {formatPropertyDate(doc.created_at)}
                          </span>
                        </div>
                      }
                    />
                  ))}
                </div>
              )}

              {visitMedia.length > 0 && (
                <div>
                  {documents.length > 0 && (
                    <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
                      Visit Photos
                    </div>
                  )}
                  {visitMedia.map((vm) => (
                    <ItemCard
                      key={vm.visit_id}
                      href={`/app/visits/${vm.visit_id}`}
                      title={vm.job_title}
                      meta={
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: "var(--text-xs)" }}>
                            {vm.photo_count} photo{vm.photo_count !== 1 ? "s" : ""}
                          </span>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            {formatPropertyDate(vm.visit_date)}
                          </span>
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </Disclosure>
          )}

          {/* ── Digital Home Vault ───────────────────────────────────────── */}
          <Disclosure title="Vault" count={vaultItems.length}>
            <div style={{ marginBottom: "var(--space-2)" }}>
              <span style={{ fontSize: "var(--text-xs)", color: vaultCompleteness.percent === 100 ? "#16a34a" : "var(--fg-muted)" }}>
                {vaultCompleteness.percent === 100
                  ? "All core categories logged"
                  : `${vaultCompleteness.coveredCount}/${vaultCompleteness.totalCount} core categories logged`}
              </span>
            </div>
            <PropertyVaultSection
              propertyId={property.id}
              clientId={property.client_id}
              initialItems={vaultItems}
              canEdit={canManageClients(session.role)}
            />
          </Disclosure>

        </div>

        <div className="p7-detail-sidebar">
          <Card>
            <SectionHeader title="Property Details" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row">
                <dt>Client</dt>
                <dd>
                  <LinkButton href={`/app/clients/${property.client_id}`} variant="ghost" size="sm">
                    {property.client_name}
                  </LinkButton>
                </dd>
              </div>
              <div className="p7-detail-row"><dt>Address</dt><dd>{property.address}</dd></div>
              <div className="p7-detail-row"><dt>City</dt><dd>{property.city || "—"}</dd></div>
              <div className="p7-detail-row"><dt>State</dt><dd>{property.state || "—"}</dd></div>
              <div className="p7-detail-row"><dt>ZIP</dt><dd>{property.zip || "—"}</dd></div>
              <div className="p7-detail-row">
                <dt>Notes</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{property.notes || "No notes"}</dd>
              </div>
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
