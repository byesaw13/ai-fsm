import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
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

type CountRow = { count: string };

type VisitRow = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  job_title: string;
  client_name: string;
  tech_name: string | null;
};

type JobRow = {
  id: string;
  title: string;
  updated_at: string;
  client_name: string;
};

type BookingRow = {
  id: string;
  name: string;
  service_category: string;
  service_description: string;
  preferred_date: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtDateLong(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function visitStatusBadge(status: string): { label: string; bg: string; color: string } {
  switch (status) {
    case "in_progress": return { label: "In Progress", bg: "#dbeafe", color: "#2563eb" };
    case "arrived":     return { label: "Arrived",    bg: "#dcfce7", color: "#16a34a" };
    case "completed":   return { label: "Completed",  bg: "#f3f4f6", color: "#6b7280" };
    default:            return { label: "Scheduled",  bg: "#fef3c7", color: "#d97706" };
  }
}

function capitalize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Shared table styles
// ---------------------------------------------------------------------------

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
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const trStyle: React.CSSProperties = { borderBottom: "1px solid var(--border)" };
const linkStyle: React.CSSProperties = { color: "var(--fg-link)", textDecoration: "none" };
const sectionHeading: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--fg-muted)",
  margin: "var(--space-8) 0 var(--space-3)",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OwnerDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");
  if (!canManageClients(session.role)) redirect("/app");

  const accountId = session.accountId;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const weekFromNow = new Date(now);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const [
    draftEstimates,
    sentEstimates,
    approvedNotScheduledCount,
    todayVisitsCount,
    visitsThisWeek,
    readyToInvoiceCount,
    openInvoices,
    overdueInvoices,
    expensesMissingJob,
    draftsNeedingIntake,
    bookingPendingCount,
    automationsStaleCount,
    memberActiveCount,
    memberOverdueCount,
    memberCapOverrunCount,
    memberSnapshotCount,
    upcomingVisitsList,
    readyToInvoiceList,
    approvedNotScheduledList,
    bookingPendingList,
  ] = await Promise.all([
    // --- metrics ---
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM estimates WHERE account_id = $1 AND status = 'draft'`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM estimates WHERE account_id = $1 AND status = 'sent'`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM jobs j
       WHERE j.account_id = $1 AND j.status IN ('quoted','draft')
         AND EXISTS (SELECT 1 FROM estimates e WHERE e.job_id = j.id AND e.account_id = j.account_id AND e.status = 'approved')
         AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.job_id = j.id AND v.account_id = j.account_id AND v.scheduled_start IS NOT NULL)`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1 AND status != 'cancelled'
         AND scheduled_start >= $2 AND scheduled_start < $3`,
      [accountId, startOfToday.toISOString(), endOfToday.toISOString()]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1 AND status != 'cancelled'
         AND scheduled_start >= $2 AND scheduled_start < $3`,
      [accountId, now.toISOString(), weekFromNow.toISOString()]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM jobs j
       WHERE j.account_id = $1 AND j.status = 'completed'
         AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.account_id = j.account_id AND i.status NOT IN ('paid','void'))`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM invoices WHERE account_id = $1 AND status IN ('sent','partial')`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM invoices
       WHERE account_id = $1 AND (status = 'overdue' OR (status = 'sent' AND due_date < $2))`,
      [accountId, now.toISOString()]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM expenses WHERE account_id = $1 AND job_id IS NULL`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM jobs WHERE account_id = $1 AND status = 'draft' AND intake_decision IS NULL`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM booking_requests WHERE account_id = $1 AND status = 'pending'`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM automations
       WHERE account_id = $1 AND enabled = true
         AND (last_run_at IS NULL OR last_run_at < NOW() - INTERVAL '24 hours')`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM maintenance_plans WHERE account_id = $1 AND status = 'active'`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active' AND renewal_date IS NOT NULL AND renewal_date < CURRENT_DATE`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1 AND generated_from_plan_id IS NOT NULL
         AND membership_cap_status IN ('cap_reached','approval_required')
         AND status NOT IN ('completed','cancelled')`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1 AND generated_from_plan_id IS NOT NULL
         AND membership_visit_phase = 'reporting'
         AND membership_snapshot_sent_at IS NULL
         AND status != 'cancelled'`,
      [accountId]
    ),

    // --- action lists ---
    query<VisitRow>(
      `SELECT v.id, v.scheduled_start::text, v.scheduled_end::text, v.status,
              j.title AS job_title, c.name AS client_name,
              u.full_name AS tech_name
       FROM visits v
       JOIN jobs j ON v.job_id = j.id
       JOIN clients c ON j.client_id = c.id
       LEFT JOIN users u ON v.assigned_user_id = u.id
       WHERE v.account_id = $1
         AND v.status != 'cancelled'
         AND v.scheduled_start >= $2
         AND v.scheduled_start < $3
       ORDER BY v.scheduled_start ASC
       LIMIT 20`,
      [accountId, now.toISOString(), weekFromNow.toISOString()]
    ),
    query<JobRow>(
      `SELECT j.id, j.title, j.updated_at::text, c.name AS client_name
       FROM jobs j
       JOIN clients c ON j.client_id = c.id
       WHERE j.account_id = $1 AND j.status = 'completed'
         AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.account_id = j.account_id AND i.status NOT IN ('paid','void'))
       ORDER BY j.updated_at DESC
       LIMIT 20`,
      [accountId]
    ),
    query<JobRow>(
      `SELECT j.id, j.title, j.updated_at::text, c.name AS client_name
       FROM jobs j
       JOIN clients c ON j.client_id = c.id
       WHERE j.account_id = $1 AND j.status IN ('quoted','draft')
         AND EXISTS (SELECT 1 FROM estimates e WHERE e.job_id = j.id AND e.account_id = j.account_id AND e.status = 'approved')
         AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.job_id = j.id AND v.account_id = j.account_id AND v.scheduled_start IS NOT NULL)
       ORDER BY j.updated_at DESC
       LIMIT 20`,
      [accountId]
    ),
    query<BookingRow>(
      `SELECT id, name, service_category, service_description, preferred_date::text, created_at::text
       FROM booking_requests
       WHERE account_id = $1 AND status = 'pending'
       ORDER BY preferred_date ASC
       LIMIT 20`,
      [accountId]
    ),
  ]);

  // Parse counts
  const n = (row: CountRow[] | undefined) => parseInt(row?.[0]?.count ?? "0", 10);

  const draftEstCount          = n(draftEstimates);
  const sentEstCount           = n(sentEstimates);
  const approvedNotSched       = n(approvedNotScheduledCount);
  const todayCount             = n(todayVisitsCount);
  const weekCount              = n(visitsThisWeek);
  const readyToInvoice         = n(readyToInvoiceCount);
  const openInv                = n(openInvoices);
  const overdueInv             = n(overdueInvoices);
  const expensesMissing        = n(expensesMissingJob);
  const intakeNeeded           = n(draftsNeedingIntake);
  const bookingPending         = n(bookingPendingCount);
  const automationsStale       = n(automationsStaleCount);
  const memberActive           = n(memberActiveCount);
  const memberOverdue          = n(memberOverdueCount);
  const memberCapOverrun       = n(memberCapOverrunCount);
  const memberSnapshot         = n(memberSnapshotCount);

  // Metric groups
  const fieldOpsMetrics: MetricCardData[] = [
    {
      label: "Today's Visits",
      value: todayCount,
      href: "/app/schedule",
      variant: "default",
    },
    {
      label: "This Week",
      value: weekCount,
      href: "/app/visits",
      variant: "default",
    },
    {
      label: "Approved — Not Scheduled",
      value: approvedNotSched,
      href: "/app/jobs?status=quoted",
      variant: approvedNotSched > 0 ? "alert" : "default",
    },
  ];

  const revenueMetrics: MetricCardData[] = [
    {
      label: "Draft Estimates",
      value: draftEstCount,
      href: "/app/estimates?status=draft",
    },
    {
      label: "Sent — Awaiting Approval",
      value: sentEstCount,
      href: "/app/estimates?status=sent",
    },
    {
      label: "Ready to Invoice",
      value: readyToInvoice,
      href: "/app/jobs?status=completed",
      variant: readyToInvoice > 0 ? "alert" : "default",
    },
    {
      label: "Open Invoices",
      value: openInv,
      href: "/app/invoices?status=sent",
    },
    {
      label: "Overdue Invoices",
      value: overdueInv,
      href: "/app/invoices?status=overdue",
      variant: overdueInv > 0 ? "alert" : "default",
    },
  ];

  const adminMetrics: MetricCardData[] = [
    {
      label: "Drafts Needing Intake",
      value: intakeNeeded,
      href: "/app/jobs?status=draft",
      variant: intakeNeeded > 0 ? "alert" : "default",
    },
    {
      label: "Booking Requests",
      value: bookingPending,
      variant: bookingPending > 0 ? "alert" : "default",
    },
    {
      label: "Expenses Missing Job",
      value: expensesMissing,
      href: "/app/expenses",
      variant: expensesMissing > 0 ? "alert" : "default",
    },
    {
      label: "Automations Stale",
      value: automationsStale,
      href: "/app/automations",
      variant: automationsStale > 0 ? "alert" : "default",
    },
  ];

  const membershipMetrics: MetricCardData[] = [
    {
      label: "Active Members",
      value: memberActive,
      href: "/app/membership-dashboard",
    },
    {
      label: "Overdue Renewals",
      value: memberOverdue,
      href: "/app/membership-dashboard",
      variant: memberOverdue > 0 ? "alert" : "default",
    },
    {
      label: "Cap Overruns",
      value: memberCapOverrun,
      href: "/app/membership-dashboard",
      variant: memberCapOverrun > 0 ? "alert" : "default",
    },
    {
      label: "Snapshots Pending",
      value: memberSnapshot,
      href: "/app/membership-dashboard",
      variant: memberSnapshot > 0 ? "alert" : "default",
    },
  ];

  return (
    <PageContainer>
      <PageHeader title="Command Center" />

      {/* ── Field Operations ──────────────────────────────────────────────── */}
      <div style={sectionHeading}>Field Operations</div>
      <MetricGrid metrics={fieldOpsMetrics} />

      <Card style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Upcoming Visits" count={upcomingVisitsList.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Scheduled visits for the next 7 days.
        </p>
        {upcomingVisitsList.length === 0 ? (
          <EmptyState title="No visits scheduled this week." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Time</th>
                  <th style={th}>Client</th>
                  <th style={th}>Job</th>
                  <th style={th}>Tech</th>
                  <th style={th}>Status</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {upcomingVisitsList.map((row) => {
                  const badge = visitStatusBadge(row.status);
                  return (
                    <tr key={row.id} style={trStyle}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(row.scheduled_start)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {fmtTime(row.scheduled_start)}
                      </td>
                      <td style={td}>{row.client_name}</td>
                      <td style={td}>{row.job_title}</td>
                      <td style={{ ...td, color: row.tech_name ? "inherit" : "var(--fg-muted)" }}>
                        {row.tech_name ?? "Unassigned"}
                      </td>
                      <td style={td}>
                        <span style={{ fontSize: "var(--text-xs)", padding: "2px 8px", borderRadius: 4, background: badge.bg, color: badge.color, fontWeight: 500 }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <Link href={`/app/visits/${row.id}` as Route} style={{ ...linkStyle, fontSize: "var(--text-xs)" }}>
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Approved — Not Scheduled" count={approvedNotScheduledList.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Jobs with an approved estimate but no scheduled visit yet.
        </p>
        {approvedNotScheduledList.length === 0 ? (
          <EmptyState title="All approved jobs have visits scheduled." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Job</th>
                  <th style={th}>Last Updated</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {approvedNotScheduledList.map((row) => (
                  <tr key={row.id} style={trStyle}>
                    <td style={td}>{row.client_name}</td>
                    <td style={td}>
                      <Link href={`/app/jobs/${row.id}` as Route} style={linkStyle}>
                        {row.title}
                      </Link>
                    </td>
                    <td style={{ ...td, color: "var(--fg-muted)" }}>{fmtDateLong(row.updated_at)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <Link href={`/app/schedule` as Route} style={{ ...linkStyle, fontSize: "var(--text-xs)" }}>
                        Schedule →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Revenue Pipeline ──────────────────────────────────────────────── */}
      <div style={sectionHeading}>Revenue Pipeline</div>
      <MetricGrid metrics={revenueMetrics} />

      <Card style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Ready to Invoice" count={readyToInvoiceList.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Completed jobs with no open invoice.
        </p>
        {readyToInvoiceList.length === 0 ? (
          <EmptyState title="No completed jobs awaiting invoicing." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Job</th>
                  <th style={th}>Completed</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {readyToInvoiceList.map((row) => (
                  <tr key={row.id} style={trStyle}>
                    <td style={td}>{row.client_name}</td>
                    <td style={td}>
                      <Link href={`/app/jobs/${row.id}` as Route} style={linkStyle}>
                        {row.title}
                      </Link>
                    </td>
                    <td style={{ ...td, color: "var(--fg-muted)" }}>{fmtDateLong(row.updated_at)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <Link href={`/app/invoices/new?jobId=${row.id}` as Route} style={{ ...linkStyle, fontSize: "var(--text-xs)" }}>
                        Create invoice →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Admin ─────────────────────────────────────────────────────────── */}
      <div style={sectionHeading}>Admin</div>
      <MetricGrid metrics={adminMetrics} />

      {bookingPendingList.length > 0 && (
        <Card style={{ marginTop: "var(--space-6)" }}>
          <SectionHeader title="Pending Booking Requests" count={bookingPendingList.length} />
          <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
            New booking requests submitted through the client portal.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Service</th>
                  <th style={th}>Preferred Date</th>
                  <th style={th}>Received</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {bookingPendingList.map((row) => (
                  <tr key={row.id} style={trStyle}>
                    <td style={td}>{row.name}</td>
                    <td style={td}>{capitalize(row.service_category)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDateLong(row.preferred_date)}</td>
                    <td style={{ ...td, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                      {fmtDateLong(row.created_at)}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <Link href={`/app/jobs/new?bookingId=${row.id}` as Route} style={{ ...linkStyle, fontSize: "var(--text-xs)" }}>
                        Convert →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Membership Pulse ──────────────────────────────────────────────── */}
      <div style={{ ...sectionHeading, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Membership Pulse</span>
        <Link href={"/app/membership-dashboard" as Route} style={{ fontSize: "var(--text-xs)", fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--fg-link)", textDecoration: "none" }}>
          Full dashboard →
        </Link>
      </div>
      <MetricGrid metrics={membershipMetrics} />

    </PageContainer>
  );
}
