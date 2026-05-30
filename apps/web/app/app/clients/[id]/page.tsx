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
import { CopyPortalLinkButton } from "@/components/CopyPortalLinkButton";

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

type CommunicationRow = {
  id: string;
  channel: "sms" | "email" | "phone";
  direction: "outbound" | "inbound";
  outcome: string;
  body_preview: string | null;
  created_at: string;
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

type MembershipRow = {
  id: string;
  status: string;
  tier: string;
  renewal_date: string | null;
  annual_visits_included: number;
  visits_used: number | string;
};

const CHANNEL_ICON: Record<CommunicationRow["channel"], string> = {
  sms: "SMS",
  email: "Email",
  phone: "Phone",
};

const DIRECTION_ARROW: Record<CommunicationRow["direction"], string> = {
  outbound: "->",
  inbound: "<-",
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

  const [properties, recentJobs, recentVisits, finance, communications, estimates, invoices, membership] = await Promise.all([
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
    query<CommunicationRow>(
      `SELECT id, channel, direction, outcome, body_preview, created_at
       FROM communications_log
       WHERE client_id = $1 AND account_id = $2
       ORDER BY created_at DESC
       LIMIT 20`,
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
    queryOne<MembershipRow>(
      `SELECT mp.id, mp.status, mp.tier, mp.renewal_date,
              COALESCE(pt.annual_visits_included, 0) AS annual_visits_included,
              (SELECT COUNT(*)::int FROM visits v JOIN jobs j ON j.id = v.job_id
               WHERE j.client_id = $1 AND v.account_id = $2
               AND v.status = 'completed'
               AND v.scheduled_start >= date_trunc('year', now())) AS visits_used
       FROM maintenance_plans mp
       LEFT JOIN plan_templates pt ON pt.id = mp.template_id
       WHERE mp.client_id = $1 AND mp.account_id = $2 AND mp.status = 'active'
       LIMIT 1`,
      [id, session.accountId]
    ).catch(() => null),  // membership query is best-effort
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

  // Open-work items for the top-of-page attention banner
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
    ...recentJobs.filter((j) => j.status === "in_progress" || j.status === "scheduled").map((j) => ({
      label: `Active job: ${j.title}`,
      href: `/app/jobs/${j.id}`,
      color: "#0284c7",
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
            <LinkButton href={`/app/maintenance-plans/new?client_id=${client.id}`} variant="secondary" size="sm">
              + Plan
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
          { label: "Lifetime value", value: dollars(paidTotal), sub: "paid invoices" },
          { label: "Jobs", value: Number(client.job_count) },
          { label: "Estimates", value: Number(client.estimate_count), sub: dollars(estimateTotal) },
          { label: "Invoices", value: Number(client.invoice_count), sub: `${dollars(invoiceTotal)} total` },
        ]}
      />

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

          {/* ── Estimates ─────────────────────────────────────────────── */}
          <Card>
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
          </Card>

          {/* ── Invoices ──────────────────────────────────────────────── */}
          <Card>
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
          </Card>

          {/* ── Membership ────────────────────────────────────────────── */}
          {membership && (
            <Card>
              <SectionHeader title="Membership" />
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Tier</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{membership.tier}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Status</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{membership.status}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Visits this year</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{Number(membership.visits_used)} / {membership.annual_visits_included}</p>
                  </div>
                  {membership.renewal_date && (
                    <div>
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Renewal</p>
                      <p style={{ margin: 0, fontWeight: 600 }}>{new Date(membership.renewal_date).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
                <LinkButton href={`/app/maintenance-plans/${membership.id}`} variant="ghost" size="sm">
                  View membership →
                </LinkButton>
              </div>
            </Card>
          )}

          <Card>
            <SectionHeader title="Communications" count={communications.length} />
            {communications.length === 0 ? (
              <EmptyState title="No communications yet" description="Emails, texts, and phone attempts will appear here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {communications.map((log) => {
                  const preview = log.body_preview && log.body_preview.length > 80
                    ? `${log.body_preview.slice(0, 77)}...`
                    : log.body_preview;
                  return (
                    <div
                      key={log.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 32px 96px 120px 1fr",
                        gap: "var(--space-2)",
                        alignItems: "center",
                        padding: "var(--space-2) 0",
                        borderBottom: "1px solid var(--border)",
                        fontSize: "var(--text-sm)",
                      }}
                    >
                      <span>{CHANNEL_ICON[log.channel]}</span>
                      <span style={{ color: "var(--fg-muted)" }}>{DIRECTION_ARROW[log.direction]}</span>
                      <span className="p7-badge p7-badge-count">{log.outcome.replaceAll("_", " ")}</span>
                      <span style={{ color: "var(--fg-muted)" }}>
                        {new Date(log.created_at).toLocaleDateString()}
                      </span>
                      <span style={{ color: preview ? "var(--fg)" : "var(--fg-muted)" }}>
                        {preview || "No preview"}
                      </span>
                    </div>
                  );
                })}
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
