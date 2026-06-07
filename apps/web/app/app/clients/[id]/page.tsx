import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
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
} from "@/components/ui";
import { ClientForm } from "../ClientForm";
import { ClientActivityTimeline } from "./ClientActivityTimeline";
import type { ActivityEvent } from "./ClientActivityTimeline";
import { activeJobStatusColor, dollars } from "./client360-helpers";
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
  open_job_count: number | string;
  last_service_date: string | null;
};

type ActiveJobRow = {
  id: string;
  title: string;
  status: string;
  property_id: string | null;
  property_address: string | null;
  next_visit_id: string | null;
  next_visit_start: string | null;
  next_visit_status: string | null;
};

type FinancialSummary = {
  estimate_total_cents: string;
  invoice_total_cents: string;
  paid_total_cents: string;
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

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const cookieStore = await cookies();
  const isMobileWorkspace = cookieStore.get("workspace_mode")?.value === "mobile";

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

  const [properties, activeJobs, activityEvents, finance, estimates, invoices, vaultItems] = await Promise.all([
    query<PropertyRow>(
      `SELECT p.id, p.name, p.address, p.city, p.state, p.zip, p.created_at,
              (SELECT COUNT(*) FROM jobs j
               WHERE j.property_id = p.id AND j.account_id = p.account_id
                 AND j.status NOT IN ('cancelled','completed','invoiced')) AS open_job_count,
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
              j.property_id,
              p.address AS property_address,
              v.id AS next_visit_id,
              v.scheduled_start AS next_visit_start,
              v.status AS next_visit_status
       FROM jobs j
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN LATERAL (
         SELECT id, scheduled_start, status
         FROM visits
         WHERE job_id = j.id AND status NOT IN ('completed','cancelled')
         ORDER BY scheduled_start ASC NULLS LAST
         LIMIT 1
       ) v ON true
       WHERE j.client_id = $1 AND j.account_id = $2
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
         UNION ALL
         SELECT 'communication'::text, cl.id, cl.created_at,
                cl.channel || ' ' || cl.direction, cl.outcome, NULL, NULL,
                NULL::text AS property_address
         FROM communications_log cl WHERE cl.client_id = $1 AND cl.account_id = $2
       ) t ORDER BY ts DESC LIMIT 50`,
      [id, session.accountId]
    ),
    queryOne<FinancialSummary>(
      `SELECT
         COALESCE((SELECT SUM(total_cents) FROM estimates WHERE client_id = $1 AND account_id = $2), 0)::text AS estimate_total_cents,
         COALESCE((SELECT SUM(total_cents) FROM invoices WHERE client_id = $1 AND account_id = $2), 0)::text AS invoice_total_cents,
         COALESCE((SELECT SUM(paid_cents) FROM invoices WHERE client_id = $1 AND account_id = $2), 0)::text AS paid_total_cents`,
      [id, session.accountId]
    ),
    query<EstimateRow>(
      `SELECT e.id, e.status, e.total_cents, e.created_at, j.title AS job_title
       FROM estimates e
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.client_id = $1 AND e.account_id = $2
       ORDER BY e.created_at DESC
       LIMIT 10`,
      [id, session.accountId]
    ),
    query<InvoiceRow>(
      `SELECT i.id, i.status, i.total_cents, i.balance_cents, i.due_date, i.created_at, j.title AS job_title
       FROM invoices i
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.client_id = $1 AND i.account_id = $2
       ORDER BY i.created_at DESC
       LIMIT 10`,
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
  const estimateTotal = Number(finance?.estimate_total_cents ?? 0);
  const invoiceTotal = Number(finance?.invoice_total_cents ?? 0);
  const paidTotal = Number(finance?.paid_total_cents ?? 0);

  // Attention banner: estimates awaiting response + overdue invoices only.
  // Active jobs are surfaced in the Active Work section below.
  const openWork = [
    ...estimates.filter((e) => e.status === "sent").map((e) => ({
      label: `Estimate awaiting response${e.job_title ? ` — ${e.job_title}` : ""}`,
      href: `/app/estimates/${e.id}`,
      color: "#d97706",
    })),
    ...invoices.filter((e) => e.status === "overdue").map((e) => ({
      label: `Overdue invoice${e.job_title ? ` — ${e.job_title}` : ""}: ${dollars(e.balance_cents)} due`,
      href: `/app/invoices/${e.id}`,
      color: "#dc2626",
    })),
  ];

  return (
    <PageContainer>
      <PageHeader
        title={client.name}
        subtitle={formatClientContact(client)}
        backHref="/app/clients"
        backLabel="Clients"
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
            <CopyPortalLinkButton
              url={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/${client.portal_token}`}
              label="Copy portal link"
            />
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

      {/* Mobile Workspace: quick-contact chips */}
      {isMobileWorkspace && (client.phone || client.email) && (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
                padding: "var(--space-2) var(--space-4)", borderRadius: "var(--radius-full)",
                background: "var(--color-green-50, #f0fdf4)", border: "1px solid var(--color-green-200, #bbf7d0)",
                color: "var(--color-green-700, #15803d)", fontWeight: 600, fontSize: "var(--text-sm)",
                textDecoration: "none",
              }}
            >
              📞 Call
            </a>
          )}
          {client.phone && (
            <a
              href={`sms:${client.phone}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
                padding: "var(--space-2) var(--space-4)", borderRadius: "var(--radius-full)",
                background: "var(--color-blue-50, #eff6ff)", border: "1px solid var(--color-blue-200, #bfdbfe)",
                color: "var(--color-blue-700, #1d4ed8)", fontWeight: 600, fontSize: "var(--text-sm)",
                textDecoration: "none",
              }}
            >
              💬 Text
            </a>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
                padding: "var(--space-2) var(--space-4)", borderRadius: "var(--radius-full)",
                background: "var(--color-slate-50, #f8fafc)", border: "1px solid var(--border)",
                color: "var(--fg)", fontWeight: 600, fontSize: "var(--text-sm)",
                textDecoration: "none",
              }}
            >
              ✉️ Email
            </a>
          )}
        </div>
      )}

      {/* KPI strip — hidden in mobile workspace */}
      {!isMobileWorkspace && (
        <MetricGrid
          metrics={[
            { label: "Lifetime value", value: dollars(paidTotal), sub: "paid invoices" },
            { label: "Jobs", value: Number(client.job_count) },
            { label: "Estimates", value: Number(client.estimate_count), sub: dollars(estimateTotal) },
            { label: "Invoices", value: Number(client.invoice_count), sub: `${dollars(invoiceTotal)} total` },
          ]}
        />
      )}

      {/* Open-work attention items */}
      {openWork.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "var(--space-3) 0" }}>
          {openWork.map((item, i) => (
            <a
              key={i}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 6,
                background: `${item.color}10`,
                border: `1px solid ${item.color}40`,
                color: item.color,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              <span>•</span>
              {item.label}
              <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>→</span>
            </a>
          ))}
        </div>
      )}

      <div className="p7-detail-layout" style={{ marginTop: "var(--space-4)" }}>
        <div className="p7-detail-primary">
          {/* ── Active Work ───────────────────────────────────────────── */}
          {activeJobs.length > 0 && (
            <Card>
              <SectionHeader title="Active Work" count={activeJobs.length} />
              <div>
                {activeJobs.map((job) => {
                  const color = activeJobStatusColor(job.status);
                  const nextVisitLabel = job.next_visit_start
                    ? `Next visit ${new Date(job.next_visit_start).toLocaleDateString([], { month: "short", day: "numeric" })}`
                    : "No visit scheduled";
                  return (
                    <ItemCard
                      key={job.id}
                      href={`/app/jobs/${job.id}`}
                      title={job.title}
                      titleBadge={
                        <span
                          style={{
                            fontSize: "var(--text-xs)",
                            fontWeight: 600,
                            color,
                            background: `${color}18`,
                            padding: "1px 7px",
                            borderRadius: 99,
                          }}
                        >
                          {job.status.replaceAll("_", " ")}
                        </span>
                      }
                      meta={
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            {nextVisitLabel}
                          </span>
                          {job.property_address && (
                            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                              · {job.property_address}
                            </span>
                          )}
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── Properties ────────────────────────────────────────────── */}
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
                {properties.map((p) => {
                  const openCount = Number(p.open_job_count ?? 0);
                  const lastService = p.last_service_date
                    ? new Date(p.last_service_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
                    : null;
                  return (
                    <ItemCard
                      key={p.id}
                      href={`/app/properties/${p.id}`}
                      title={p.name?.trim() || p.address}
                      meta={
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            {formatPropertyAddress(p)}
                          </span>
                          {openCount > 0 && (
                            <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "#0284c7" }}>
                              {openCount} open job{openCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            {lastService ? `Last serviced ${lastService}` : "Never serviced"}
                          </span>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            )}
          </Card>

          {/* ── Unified Activity Timeline — hidden in mobile workspace ── */}
          {!isMobileWorkspace && (
            <Card>
              <SectionHeader title="Activity" count={activityEvents.length} />
              <ClientActivityTimeline events={activityEvents} />
            </Card>
          )}

          {/* ── Estimates — hidden in mobile workspace ────────────────── */}
          {!isMobileWorkspace && <Card>
            <SectionHeader
              title="Estimates"
              count={estimates.length}
              action={canCreateEstimate ? <LinkButton href={`/app/estimates/new?client_id=${client.id}`} variant="ghost" size="sm">+ Estimate</LinkButton> : undefined}
            />
            {estimates.length === 0 ? (
              <EmptyState title="No estimates yet" description="Estimates created for this client will appear here." />
            ) : (
              <div>
                {estimates.map((e) => (
                  <ItemCard
                    key={e.id}
                    href={`/app/estimates/${e.id}`}
                    title={e.job_title ?? "Estimate"}
                    meta={
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="p7-badge p7-badge-count">{e.status}</span>
                        <span>{dollars(e.total_cents)}</span>
                        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                          {new Date(e.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </Card>}

          {/* ── Invoices — hidden in mobile workspace ─────────────────── */}
          {!isMobileWorkspace && <Card>
            <SectionHeader title="Invoices" count={invoices.length} />
            {invoices.length === 0 ? (
              <EmptyState title="No invoices yet" description="Invoices will appear here once an estimate is approved." />
            ) : (
              <div>
                {invoices.map((inv) => (
                  <ItemCard
                    key={inv.id}
                    href={`/app/invoices/${inv.id}`}
                    title={inv.job_title ?? "Invoice"}
                    meta={
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className={`p7-badge p7-badge-count ${inv.status === "overdue" ? "p7-badge-danger" : ""}`}>{inv.status}</span>
                        <span>{dollars(inv.total_cents)}</span>
                        {inv.balance_cents > 0 && (
                          <span style={{ color: inv.status === "overdue" ? "#dc2626" : "var(--fg-muted)", fontSize: "var(--text-xs)", fontWeight: 600 }}>
                            {dollars(inv.balance_cents)} due
                          </span>
                        )}
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </Card>}

          {/* ── Documents & Photos — hidden in mobile workspace ────────── */}
          {!isMobileWorkspace && vaultItems.length > 0 && (
            <Card>
              <SectionHeader title="Documents & Photos" count={vaultItems.length} />
              <div>
                {vaultItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    href={`/app/properties/${item.property_id}`}
                    title={item.name}
                    meta={
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <span className="p7-badge p7-badge-count">
                          {VAULT_CATEGORY_LABELS[item.category] ?? item.category}
                        </span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                          {item.property_address}
                        </span>
                        {Number(item.photo_count) > 0 && (
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                            {item.photo_count} photo{Number(item.photo_count) !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    }
                  />
                ))}
              </div>
            </Card>
          )}

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
