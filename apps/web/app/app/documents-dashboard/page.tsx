import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  Card,
  EmptyState,
  MetricGrid,
  PageContainer,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import type { MetricCardData } from "@/components/ui";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocTypeRow = {
  document_type: string;
  count: string;
  missing_title: string;
};

type MissingRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  document_type: string;
  created_at: string;
};

type EstimateStatusRow = {
  status: string;
  count: string;
};

type InvoiceStatusRow = {
  status: string;
  count: string;
};

type PlanTemplateRow = {
  id: string;
  name: string;
  tier: string;
  visit_count_per_year: string;
  base_price_cents: string;
  is_active: boolean;
};

type DuplicateTemplateRow = {
  tier: string;
  count: string;
};

type RecentDocRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string | null;
  original_filename: string | null;
  document_type: string;
  is_master_template: boolean;
  is_archived: boolean;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmt(cents: number | string): string {
  return `$${(Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  estimate_pdf:     "Estimate PDF",
  estimate_docx:    "Estimate DOCX",
  invoice_pdf:      "Invoice PDF",
  invoice_docx:     "Invoice DOCX",
  receipt:          "Receipt",
  photo:            "Photo",
  signed_approval:  "Signed Approval",
  insurance:        "Insurance",
  contract:         "Contract",
  client_file:      "Client File",
  sop:              "SOP",
  template:         "Template",
  other:            "Other",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  job:      "Job",
  client:   "Client",
  property: "Property",
  invoice:  "Invoice",
  estimate: "Estimate",
  expense:  "Expense",
};

const TIER_LABELS: Record<string, string> = {
  essential: "Essential",
  plus:      "Plus",
  premier:   "Premier",
};

const ESTIMATE_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:    { bg: "#f1f5f9", color: "#475569" },
  sent:     { bg: "#dbeafe", color: "#2563eb" },
  approved: { bg: "#dcfce7", color: "#16a34a" },
  declined: { bg: "#fee2e2", color: "#dc2626" },
  expired:  { bg: "#fef3c7", color: "#d97706" },
};

const INVOICE_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:   { bg: "#f1f5f9", color: "#475569" },
  sent:    { bg: "#dbeafe", color: "#2563eb" },
  partial: { bg: "#fef3c7", color: "#d97706" },
  paid:    { bg: "#dcfce7", color: "#16a34a" },
  overdue: { bg: "#fee2e2", color: "#dc2626" },
  void:    { bg: "#f1f5f9", color: "#94a3b8" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DocumentsDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;

  const [
    docTypeRows,
    missingRows,
    estimateStatusRows,
    invoiceStatusRows,
    planTemplateRows,
    duplicateTemplateRows,
    recentDocRows,
  ] = await Promise.all([

    // Document count by type, with missing title count
    query<DocTypeRow>(
      `SELECT
         document_type,
         COUNT(*)::text AS count,
         COUNT(*) FILTER (WHERE title IS NULL AND original_filename IS NULL)::text AS missing_title
       FROM document_links
       WHERE account_id = $1
         AND is_archived = false
       GROUP BY document_type
       ORDER BY count DESC`,
      [accountId]
    ),

    // Documents missing both title and original_filename (most recent 20)
    query<MissingRow>(
      `SELECT id, entity_type, entity_id, document_type, created_at::text
       FROM document_links
       WHERE account_id = $1
         AND is_archived = false
         AND title IS NULL
         AND original_filename IS NULL
       ORDER BY created_at DESC
       LIMIT 20`,
      [accountId]
    ),

    // Estimate status distribution
    query<EstimateStatusRow>(
      `SELECT status, COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
       GROUP BY status
       ORDER BY
         CASE status
           WHEN 'draft'    THEN 0
           WHEN 'sent'     THEN 1
           WHEN 'approved' THEN 2
           WHEN 'declined' THEN 3
           ELSE 4
         END`,
      [accountId]
    ),

    // Invoice status distribution
    query<InvoiceStatusRow>(
      `SELECT status, COUNT(*)::text AS count
       FROM invoices
       WHERE account_id = $1
       GROUP BY status
       ORDER BY
         CASE status
           WHEN 'draft'   THEN 0
           WHEN 'sent'    THEN 1
           WHEN 'partial' THEN 2
           WHEN 'paid'    THEN 3
           WHEN 'overdue' THEN 4
           ELSE 5
         END`,
      [accountId]
    ),

    // Plan templates (all)
    query<PlanTemplateRow>(
      `SELECT id, name, tier, visit_count_per_year::text, base_price_cents::text, is_active
       FROM plan_templates
       WHERE account_id = $1
       ORDER BY tier ASC, sort_order ASC, name ASC`,
      [accountId]
    ),

    // Duplicate active plan templates (same tier, more than one active)
    query<DuplicateTemplateRow>(
      `SELECT tier, COUNT(*)::text AS count
       FROM plan_templates
       WHERE account_id = $1 AND is_active = true
       GROUP BY tier
       HAVING COUNT(*) > 1`,
      [accountId]
    ),

    // Most recent 10 non-archived documents
    query<RecentDocRow>(
      `SELECT id, entity_type, entity_id, title, original_filename,
              document_type, is_master_template, is_archived, created_at::text
       FROM document_links
       WHERE account_id = $1 AND is_archived = false
       ORDER BY created_at DESC
       LIMIT 10`,
      [accountId]
    ),
  ]);

  // -- Derived values --------------------------------------------------------

  const totalDocs = docTypeRows.reduce((s, r) => s + parseInt(r.count, 10), 0);
  const totalMissing = docTypeRows.reduce((s, r) => s + parseInt(r.missing_title, 10), 0);
  const archivedCount = 0; // not queried — non-archived only above
  const activePlanTemplates = planTemplateRows.filter((r) => r.is_active).length;
  const duplicateCount = duplicateTemplateRows.reduce((s, r) => s + parseInt(r.count, 10) - 1, 0);

  const allTiers = ["essential", "plus", "premier"];
  const coveredTiers = new Set(planTemplateRows.filter((r) => r.is_active).map((r) => r.tier));
  const missingTiers = allTiers.filter((t) => !coveredTiers.has(t));

  // -- Metrics ---------------------------------------------------------------

  const metrics: MetricCardData[] = [
    {
      label: "Total Documents",
      value: totalDocs,
      sub: "Non-archived document links",
      href: "#doc-types",
      variant: "default",
    },
    {
      label: "Missing Filenames",
      value: totalMissing,
      sub: "Documents with no title or filename",
      href: "#missing",
      variant: totalMissing > 0 ? "alert" : "default",
    },
    {
      label: "Active Plan Templates",
      value: activePlanTemplates,
      sub: missingTiers.length > 0 ? `Missing: ${missingTiers.map((t) => TIER_LABELS[t]).join(", ")}` : "All tiers covered",
      href: "#templates",
      variant: missingTiers.length > 0 ? "alert" : "success",
    },
    {
      label: "Duplicate Templates",
      value: duplicateCount,
      sub: "Active templates sharing the same tier",
      href: "#templates",
      variant: duplicateCount > 0 ? "alert" : "default",
    },
  ];

  // -- Table styles ----------------------------------------------------------

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "var(--space-2) var(--space-3)",
    color: "var(--fg-muted)",
    fontWeight: 500,
    fontSize: "var(--text-sm)",
    borderBottom: "1px solid var(--border)",
  };
  const td: React.CSSProperties = {
    padding: "var(--space-2) var(--space-3)",
    fontSize: "var(--text-sm)",
    verticalAlign: "middle",
  };

  // --------------------------------------------------------------------------

  return (
    <PageContainer>
      <PageHeader
        title="Documents Dashboard"
        subtitle="Document library health, lifecycle counts, and template coverage"
      />

      <MetricGrid metrics={metrics} />

      {/* ── Estimate & Invoice Lifecycle ───────────────────────────────────── */}
      <Card style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Document Lifecycle" />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Status distribution across estimates and invoices.
        </p>
        <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>Estimates</div>
            {estimateStatusRows.length === 0 ? (
              <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>None</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {estimateStatusRows.map((row) => {
                  const s = ESTIMATE_STATUS_COLORS[row.status] ?? { bg: "#f1f5f9", color: "#475569" };
                  return (
                    <div key={row.status} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <span style={{
                        fontSize: "var(--text-xs)", padding: "1px 8px",
                        borderRadius: 4, fontWeight: 500, minWidth: 80, textAlign: "center",
                        background: s.bg, color: s.color,
                      }}>
                        {row.status}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "var(--text-sm)", fontWeight: 600 }}>
                        {row.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>Invoices</div>
            {invoiceStatusRows.length === 0 ? (
              <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>None</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {invoiceStatusRows.map((row) => {
                  const s = INVOICE_STATUS_COLORS[row.status] ?? { bg: "#f1f5f9", color: "#475569" };
                  return (
                    <div key={row.status} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <span style={{
                        fontSize: "var(--text-xs)", padding: "1px 8px",
                        borderRadius: 4, fontWeight: 500, minWidth: 80, textAlign: "center",
                        background: s.bg, color: s.color,
                      }}>
                        {row.status}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: "var(--text-sm)", fontWeight: 600 }}>
                        {row.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── Document Library by Type ───────────────────────────────────────── */}
      <Card id="doc-types" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Document Library" count={totalDocs} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Non-archived document links grouped by type. Highlight indicates documents with missing title and filename.
        </p>
        {docTypeRows.length === 0 ? (
          <EmptyState title="No documents" description="Documents linked to jobs, clients, estimates, and invoices will appear here." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Type</th>
                  <th style={{ ...th, textAlign: "right" }}>Count</th>
                  <th style={{ ...th, textAlign: "right" }}>Missing Name</th>
                </tr>
              </thead>
              <tbody>
                {docTypeRows.map((row) => {
                  const missing = parseInt(row.missing_title, 10);
                  return (
                    <tr
                      key={row.document_type}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: missing > 0 ? "#fff7ed" : undefined,
                      }}
                    >
                      <td style={td}>{DOC_TYPE_LABELS[row.document_type] ?? row.document_type}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.count}</td>
                      <td style={{ ...td, textAlign: "right", color: missing > 0 ? "#dc2626" : "var(--fg-muted)", fontWeight: missing > 0 ? 600 : undefined }}>
                        {missing > 0 ? missing : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Missing Filenames ──────────────────────────────────────────────── */}
      <Card id="missing" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Missing Filename" count={missingRows.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Documents where neither title nor original filename was recorded.
        </p>
        {missingRows.length === 0 ? (
          <EmptyState title="No unnamed documents" description="All documents have a title or filename." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Entity</th>
                  <th style={th}>Type</th>
                  <th style={th}>Added</th>
                </tr>
              </thead>
              <tbody>
                {missingRows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={td}>
                      {ENTITY_TYPE_LABELS[row.entity_type] ?? row.entity_type} {" "}
                      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                        {row.entity_id.slice(0, 8)}…
                      </span>
                    </td>
                    <td style={{ ...td, color: "var(--fg-muted)" }}>
                      {DOC_TYPE_LABELS[row.document_type] ?? row.document_type}
                    </td>
                    <td style={{ ...td, color: "var(--fg-muted)" }}>{fmtDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Plan Templates ─────────────────────────────────────────────────── */}
      <Card id="templates" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Membership Plan Templates" count={planTemplateRows.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Active plan templates used when creating new memberships. Ideally one active template per tier.
          {missingTiers.length > 0 && (
            <span style={{ color: "#d97706", fontWeight: 500 }}>
              {" "}Missing tiers: {missingTiers.map((t) => TIER_LABELS[t]).join(", ")}.
            </span>
          )}
          {duplicateCount > 0 && (
            <span style={{ color: "#dc2626", fontWeight: 500 }}>
              {" "}{duplicateCount} duplicate active template{duplicateCount !== 1 ? "s" : ""} detected.
            </span>
          )}
        </p>
        {planTemplateRows.length === 0 ? (
          <EmptyState
            title="No plan templates"
            description="Plan templates allow you to create memberships from a standard starting point."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Tier</th>
                  <th style={{ ...th, textAlign: "right" }}>Visits/Year</th>
                  <th style={{ ...th, textAlign: "right" }}>Base Price</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {planTemplateRows.map((row) => {
                  const isDuplicate = duplicateTemplateRows.some((d) => d.tier === row.tier) && row.is_active;
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isDuplicate ? "#fff7ed" : undefined,
                      }}
                    >
                      <td style={td}>{row.name}</td>
                      <td style={td}>{TIER_LABELS[row.tier] ?? row.tier}</td>
                      <td style={{ ...td, textAlign: "right" }}>{row.visit_count_per_year}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(row.base_price_cents)}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: "var(--text-xs)", padding: "2px 8px",
                          borderRadius: 4, fontWeight: 500,
                          background: row.is_active ? (isDuplicate ? "#fef3c7" : "#dcfce7") : "#f1f5f9",
                          color: row.is_active ? (isDuplicate ? "#d97706" : "#16a34a") : "#94a3b8",
                        }}>
                          {row.is_active ? (isDuplicate ? "Duplicate" : "Active") : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Recent Documents ───────────────────────────────────────────────── */}
      <Card style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-8)" }}>
        <SectionHeader title="Recently Added" count={recentDocRows.length} />
        {recentDocRows.length === 0 ? (
          <EmptyState title="No documents yet" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Type</th>
                  <th style={th}>Entity</th>
                  <th style={th}>Added</th>
                  <th style={th}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {recentDocRows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={td}>
                      {row.title ?? row.original_filename ?? (
                        <span style={{ color: "#dc2626", fontSize: "var(--text-xs)" }}>No name</span>
                      )}
                    </td>
                    <td style={{ ...td, color: "var(--fg-muted)" }}>
                      {DOC_TYPE_LABELS[row.document_type] ?? row.document_type}
                    </td>
                    <td style={{ ...td, color: "var(--fg-muted)" }}>
                      {ENTITY_TYPE_LABELS[row.entity_type] ?? row.entity_type}
                    </td>
                    <td style={{ ...td, color: "var(--fg-muted)" }}>{fmtDate(row.created_at)}</td>
                    <td style={td}>
                      {row.is_master_template && (
                        <span style={{
                          fontSize: "var(--text-xs)", padding: "1px 6px",
                          borderRadius: 4, background: "#dbeafe", color: "#2563eb", fontWeight: 500,
                        }}>
                          Template
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
