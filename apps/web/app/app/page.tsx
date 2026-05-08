import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  Card,
  LinkButton,
  MetricGrid,
  PageContainer,
  RoleBadge,
  SectionHeader,
} from "@/components/ui";
import type { MetricCardData } from "@/components/ui";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserRow       = { full_name: string };
type CountRow      = { count: string };
type RevenueRow    = { this_week: string; last_week: string; this_month: string; last_month: string };
type EstimateRow   = { draft_count: string; draft_cents: string; sent_count: string; sent_cents: string; expiring_count: string };
type InvoiceRow    = { open_count: string; open_balance: string; overdue_count: string; overdue_balance: string; total_outstanding: string };
type PipelineRow   = { count: string; total_cents: string };
type MemberPlanRow = { active_count: string; overdue_count: string };
type MemberVisitRow= { cap_overrun_count: string; snapshot_count: string };

type TodayVisit = {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  job_title: string;
  client_name: string;
  tech_name: string | null;
  property_address: string | null;
};

type OverdueInvoiceRow = {
  id: string;
  invoice_number: string;
  client_name: string | null;
  due_date: string | null;
  total_cents: string;
  paid_cents: string;
};

type ExpiringEstimateRow = {
  id: string;
  client_name: string | null;
  expires_at: string;
  total_cents: string;
};

type AttentionItem = {
  kind: string;
  id: string;
  label: string;
  sub: string;
  href: string;
  urgency: "high" | "medium" | "low";
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtCents(cents: number | string): string {
  const n = Number(cents);
  if (n === 0) return "$0";
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateLong(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function pctChange(current: number, prior: number): { label: string; up: boolean | null } {
  if (prior === 0 && current === 0) return { label: "", up: null };
  if (prior === 0) return { label: "new", up: true };
  const pct = Math.round(((current - prior) / prior) * 100);
  return { label: `${Math.abs(pct)}%`, up: pct >= 0 };
}

function visitStatusColor(status: string): string {
  switch (status) {
    case "in_progress": return "#2563eb";
    case "arrived":     return "#16a34a";
    case "completed":   return "#6b7280";
    default:            return "#d97706";
  }
}

function visitStatusLabel(status: string): string {
  switch (status) {
    case "in_progress": return "In Progress";
    case "arrived":     return "Arrived";
    case "completed":   return "Done";
    default:            return "Scheduled";
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;
  const now = new Date();

  // Date windows
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday   = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);

  const dow = now.getDay();
  const daysToMonday = dow === 0 ? 6 : dow - 1;
  const startOfThisWeek = new Date(startOfToday); startOfThisWeek.setDate(startOfThisWeek.getDate() - daysToMonday);
  const startOfLastWeek = new Date(startOfThisWeek); startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    userRows,
    clientCountRows,
    openJobCountRows,
    todayVisits,
    revenueRows,
    estimateRows,
    invoiceRows,
    approvedNotSched,
    readyToInvoice,
    overdueInvoiceRows,
    expiringEstimateRows,
    draftsNeedingIntake,
    bookingPending,
    memberPlanRows,
    memberVisitRows,
  ] = await Promise.all([
    query<UserRow>(`SELECT full_name FROM users WHERE id = $1`, [session.userId]),

    query<CountRow>(`SELECT COUNT(*)::text AS count FROM clients WHERE account_id = $1`, [accountId]),

    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM jobs
       WHERE account_id = $1 AND status NOT IN ('completed','invoiced','cancelled')`,
      [accountId]
    ),

    // Today's full visit list
    query<TodayVisit>(
      `SELECT v.id, v.scheduled_start::text, v.scheduled_end::text, v.status,
              j.title AS job_title, c.name AS client_name,
              u.full_name AS tech_name, p.address AS property_address
       FROM visits v
       JOIN jobs j ON v.job_id = j.id
       JOIN clients c ON j.client_id = c.id
       LEFT JOIN users u ON v.assigned_user_id = u.id
       LEFT JOIN properties p ON j.property_id = p.id
       WHERE v.account_id = $1 AND v.status != 'cancelled'
         AND v.scheduled_start >= $2 AND v.scheduled_start < $3
       ORDER BY v.scheduled_start ASC
       LIMIT 20`,
      [accountId, startOfToday.toISOString(), endOfToday.toISOString()]
    ),

    // Revenue: this week / last week / this month / last month (one query)
    query<RevenueRow>(
      `SELECT
         COALESCE(SUM(total_cents) FILTER (WHERE created_at >= $2), 0)::text AS this_week,
         COALESCE(SUM(total_cents) FILTER (WHERE created_at >= $3 AND created_at < $2), 0)::text AS last_week,
         COALESCE(SUM(total_cents) FILTER (WHERE created_at >= $4), 0)::text AS this_month,
         COALESCE(SUM(total_cents) FILTER (WHERE created_at >= $5 AND created_at < $4), 0)::text AS last_month
       FROM invoices
       WHERE account_id = $1 AND status NOT IN ('draft','void') AND created_at >= $5`,
      [accountId,
       startOfThisWeek.toISOString(), startOfLastWeek.toISOString(),
       startOfThisMonth.toISOString(), startOfLastMonth.toISOString()]
    ),

    // Estimates: draft + sent counts and dollar values, expiring count
    query<EstimateRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'draft')::text AS draft_count,
         COALESCE(SUM(total_cents) FILTER (WHERE status = 'draft'), 0)::text AS draft_cents,
         COUNT(*) FILTER (WHERE status = 'sent')::text AS sent_count,
         COALESCE(SUM(total_cents) FILTER (WHERE status = 'sent'), 0)::text AS sent_cents,
         COUNT(*) FILTER (
           WHERE status = 'sent' AND expires_at IS NOT NULL
             AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '7 days'
         )::text AS expiring_count
       FROM estimates WHERE account_id = $1 AND status IN ('draft','sent')`,
      [accountId]
    ),

    // Invoices: open / overdue counts and balances, total outstanding
    query<InvoiceRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('sent','partial'))::text AS open_count,
         COALESCE(SUM(total_cents - COALESCE(paid_cents,0)) FILTER (WHERE status IN ('sent','partial')), 0)::text AS open_balance,
         COUNT(*) FILTER (
           WHERE status = 'overdue' OR (status = 'sent' AND due_date IS NOT NULL AND due_date < NOW())
         )::text AS overdue_count,
         COALESCE(SUM(total_cents - COALESCE(paid_cents,0)) FILTER (
           WHERE status = 'overdue' OR (status = 'sent' AND due_date IS NOT NULL AND due_date < NOW())
         ), 0)::text AS overdue_balance,
         COALESCE(SUM(total_cents - COALESCE(paid_cents,0)), 0)::text AS total_outstanding
       FROM invoices WHERE account_id = $1 AND status NOT IN ('paid','void','draft')`,
      [accountId]
    ),

    // Approved → not scheduled (count + estimated value)
    query<PipelineRow>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(max_cents), 0)::text AS total_cents
       FROM (
         SELECT j.id, MAX(e.total_cents) AS max_cents
         FROM jobs j
         JOIN estimates e ON e.job_id = j.id AND e.account_id = j.account_id AND e.status = 'approved'
         WHERE j.account_id = $1 AND j.status IN ('quoted','draft')
           AND NOT EXISTS (
             SELECT 1 FROM visits v WHERE v.job_id = j.id AND v.account_id = j.account_id AND v.scheduled_start IS NOT NULL
           )
         GROUP BY j.id
       ) sub`,
      [accountId]
    ),

    // Ready to invoice (count + estimated value from approved estimate)
    query<PipelineRow>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(max_cents), 0)::text AS total_cents
       FROM (
         SELECT j.id, COALESCE(MAX(e.total_cents), 0) AS max_cents
         FROM jobs j
         LEFT JOIN estimates e ON e.job_id = j.id AND e.account_id = j.account_id AND e.status = 'approved'
         WHERE j.account_id = $1 AND j.status = 'completed'
           AND NOT EXISTS (
             SELECT 1 FROM invoices i WHERE i.job_id = j.id AND i.account_id = j.account_id AND i.status NOT IN ('paid','void')
           )
         GROUP BY j.id
       ) sub`,
      [accountId]
    ),

    // Overdue invoice rows for attention items
    query<OverdueInvoiceRow>(
      `SELECT i.id, i.invoice_number, c.name AS client_name,
              i.due_date::text, i.total_cents::text, i.paid_cents::text
       FROM invoices i LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.account_id = $1
         AND i.status IN ('overdue','sent','partial')
         AND i.due_date IS NOT NULL AND i.due_date < NOW()
       ORDER BY i.due_date ASC LIMIT 5`,
      [accountId]
    ),

    // Expiring estimate rows for attention items
    query<ExpiringEstimateRow>(
      `SELECT e.id, c.name AS client_name, e.expires_at::text, e.total_cents::text
       FROM estimates e LEFT JOIN clients c ON c.id = e.client_id
       WHERE e.account_id = $1 AND e.status = 'sent'
         AND e.expires_at IS NOT NULL
         AND e.expires_at > NOW() AND e.expires_at <= NOW() + INTERVAL '7 days'
       ORDER BY e.expires_at ASC LIMIT 5`,
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

    // Membership plan health
    query<MemberPlanRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::text AS active_count,
         COUNT(*) FILTER (WHERE status = 'active' AND renewal_date IS NOT NULL AND renewal_date < CURRENT_DATE)::text AS overdue_count
       FROM maintenance_plans WHERE account_id = $1`,
      [accountId]
    ),

    // Membership visit issues
    query<MemberVisitRow>(
      `SELECT
         COUNT(*) FILTER (WHERE membership_cap_status IN ('cap_reached','approval_required') AND status NOT IN ('completed','cancelled'))::text AS cap_overrun_count,
         COUNT(*) FILTER (WHERE membership_visit_phase = 'reporting' AND membership_snapshot_sent_at IS NULL AND status != 'cancelled')::text AS snapshot_count
       FROM visits WHERE account_id = $1 AND generated_from_plan_id IS NOT NULL`,
      [accountId]
    ),
  ]);

  // ---------------------------------------------------------------------------
  // Parse values
  // ---------------------------------------------------------------------------
  const p    = (rows: CountRow[] | undefined) => parseInt(rows?.[0]?.count ?? "0", 10);
  const firstName   = (userRows[0]?.full_name ?? "").split(" ")[0] || "there";
  const clientCount = p(clientCountRows);
  const openJobCount = p(openJobCountRows);

  const rev         = revenueRows[0] ?? { this_week: "0", last_week: "0", this_month: "0", last_month: "0" };
  const thisWeekRev = parseInt(rev.this_week, 10);
  const lastWeekRev = parseInt(rev.last_week, 10);
  const thisMonthRev= parseInt(rev.this_month, 10);
  const lastMonthRev= parseInt(rev.last_month, 10);
  const weekChange  = pctChange(thisWeekRev, lastWeekRev);
  const monthChange = pctChange(thisMonthRev, lastMonthRev);

  const est         = estimateRows[0] ?? { draft_count:"0", draft_cents:"0", sent_count:"0", sent_cents:"0", expiring_count:"0" };
  const draftEstCount   = parseInt(est.draft_count, 10);
  const sentEstCount    = parseInt(est.sent_count, 10);
  const expiringEstCount= parseInt(est.expiring_count, 10);

  const inv         = invoiceRows[0] ?? { open_count:"0", open_balance:"0", overdue_count:"0", overdue_balance:"0", total_outstanding:"0" };
  const openInvCount   = parseInt(inv.open_count, 10);
  const overdueInvCount= parseInt(inv.overdue_count, 10);
  const totalOutstanding = parseInt(inv.total_outstanding, 10);

  const approvedNotSchedCount = parseInt(approvedNotSched[0]?.count ?? "0", 10);
  const approvedNotSchedCents = parseInt(approvedNotSched[0]?.total_cents ?? "0", 10);
  const readyCount  = parseInt(readyToInvoice[0]?.count ?? "0", 10);
  const readyCents  = parseInt(readyToInvoice[0]?.total_cents ?? "0", 10);

  const intakeNeeded  = p(draftsNeedingIntake);
  const bookingCount  = p(bookingPending);

  const memberPlan  = memberPlanRows[0] ?? { active_count: "0", overdue_count: "0" };
  const memberVisit = memberVisitRows[0] ?? { cap_overrun_count: "0", snapshot_count: "0" };
  const memberActive   = parseInt(memberPlan.active_count, 10);
  const memberOverdue  = parseInt(memberPlan.overdue_count, 10);
  const memberCapOverrun = parseInt(memberVisit.cap_overrun_count, 10);
  const memberSnapshot = parseInt(memberVisit.snapshot_count, 10);

  // ---------------------------------------------------------------------------
  // Attention items
  // ---------------------------------------------------------------------------
  const attentionItems: AttentionItem[] = [];

  for (const inv of overdueInvoiceRows) {
    const daysOverdue = Math.floor((Date.now() - new Date(inv.due_date!).getTime()) / 86_400_000);
    const balance = parseInt(inv.total_cents) - parseInt(inv.paid_cents);
    attentionItems.push({
      kind: "overdue_invoice",
      id: inv.id,
      label: `Invoice ${inv.invoice_number}${inv.client_name ? ` — ${inv.client_name}` : ""}`,
      sub: `${fmtCents(balance)} overdue ${daysOverdue}d`,
      href: `/app/invoices/${inv.id}`,
      urgency: daysOverdue >= 30 ? "high" : daysOverdue >= 7 ? "medium" : "low",
    });
  }

  for (const est of expiringEstimateRows) {
    const daysLeft = Math.ceil((new Date(est.expires_at).getTime() - Date.now()) / 86_400_000);
    attentionItems.push({
      kind: "expiring_estimate",
      id: est.id,
      label: `Estimate${est.client_name ? ` — ${est.client_name}` : ""} expiring in ${daysLeft}d`,
      sub: `${fmtCents(parseInt(est.total_cents))} · send a follow-up`,
      href: `/app/estimates/${est.id}`,
      urgency: daysLeft <= 2 ? "high" : "medium",
    });
  }

  if (intakeNeeded > 0) {
    attentionItems.push({
      kind: "intake",
      id: "intake",
      label: `${intakeNeeded} draft job${intakeNeeded > 1 ? "s" : ""} need${intakeNeeded === 1 ? "s" : ""} intake decision`,
      sub: "Review and classify before estimating",
      href: "/app/jobs?status=draft",
      urgency: "medium",
    });
  }

  if (bookingCount > 0) {
    attentionItems.push({
      kind: "booking",
      id: "booking",
      label: `${bookingCount} new booking request${bookingCount > 1 ? "s" : ""} pending`,
      sub: "Convert to jobs before clients lose interest",
      href: "/app/jobs",
      urgency: "medium",
    });
  }

  // Sort: high urgency first
  attentionItems.sort((a, b) =>
    (a.urgency === "high" ? 0 : a.urgency === "medium" ? 1 : 2) -
    (b.urgency === "high" ? 0 : b.urgency === "medium" ? 1 : 2)
  );

  // ---------------------------------------------------------------------------
  // Onboarding state
  // ---------------------------------------------------------------------------
  const showOnboarding = clientCount === 0;
  const showNextStep   = !showOnboarding && openJobCount === 0;

  // ---------------------------------------------------------------------------
  // Pipeline metrics (with dollar sub-values)
  // ---------------------------------------------------------------------------
  const estimateMetrics: MetricCardData[] = [
    {
      label: "Draft Estimates",
      value: draftEstCount,
      sub: draftEstCount > 0 ? fmtCents(est.draft_cents) : undefined,
      href: "/app/estimates?status=draft",
    },
    {
      label: "Sent — Awaiting Approval",
      value: sentEstCount,
      sub: sentEstCount > 0
        ? `${fmtCents(est.sent_cents)}${expiringEstCount > 0 ? ` · ${expiringEstCount} expiring` : ""}`
        : expiringEstCount > 0 ? `${expiringEstCount} expiring soon` : undefined,
      href: "/app/estimates?status=sent",
      variant: expiringEstCount > 0 ? "alert" : "default",
    },
    {
      label: "Approved — Not Scheduled",
      value: approvedNotSchedCount,
      sub: approvedNotSchedCount > 0 ? fmtCents(approvedNotSchedCents) : undefined,
      href: "/app/jobs?status=quoted",
      variant: approvedNotSchedCount > 0 ? "alert" : "default",
    },
  ];

  const invoiceMetrics: MetricCardData[] = [
    {
      label: "Ready to Invoice",
      value: readyCount,
      sub: readyCount > 0 ? fmtCents(readyCents) : undefined,
      href: "/app/jobs?status=completed",
      variant: readyCount > 0 ? "alert" : "default",
    },
    {
      label: "Open Invoices",
      value: openInvCount,
      sub: openInvCount > 0 ? `${fmtCents(inv.open_balance)} outstanding` : undefined,
      href: "/app/invoices?status=sent",
    },
    {
      label: "Overdue",
      value: overdueInvCount,
      sub: overdueInvCount > 0 ? fmtCents(inv.overdue_balance) : undefined,
      href: "/app/invoices?status=overdue",
      variant: overdueInvCount > 0 ? "alert" : "default",
    },
  ];

  const membershipMetrics: MetricCardData[] = [
    { label: "Active Members",      value: memberActive,    href: "/app/membership-dashboard" },
    { label: "Overdue Renewals",    value: memberOverdue,   href: "/app/membership-dashboard", variant: memberOverdue > 0 ? "alert" : "default" },
    { label: "Cap Overruns",        value: memberCapOverrun,href: "/app/membership-dashboard", variant: memberCapOverrun > 0 ? "alert" : "default" },
    { label: "Snapshots Pending",   value: memberSnapshot,  href: "/app/membership-dashboard", variant: memberSnapshot > 0 ? "alert" : "default" },
  ];

  // ---------------------------------------------------------------------------
  // Shared styles
  // ---------------------------------------------------------------------------
  const sectionLabel: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--fg-muted)",
    margin: "var(--space-8) 0 var(--space-3)",
  };
  const statValue: React.CSSProperties = {
    fontSize: "var(--text-2xl)",
    fontWeight: "var(--font-bold)",
    color: "var(--fg)",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.1,
  };
  const statLabel: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    color: "var(--fg-muted)",
    marginTop: "var(--space-1)",
  };
  const statChange = (up: boolean | null): React.CSSProperties => ({
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    color: up === null ? "var(--fg-muted)" : up ? "#16a34a" : "#dc2626",
    marginLeft: "var(--space-1)",
  });

  const todayStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <PageContainer>

      {/* ── Greeting ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-1)" }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color: "var(--fg)" }}>
            {getGreeting()}, {firstName}
          </h1>
          <RoleBadge variant={session.role as "owner" | "admin" | "tech"}>{session.role}</RoleBadge>
        </div>
        <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {todayStr}
          {todayVisits.length > 0 && ` · ${todayVisits.length} visit${todayVisits.length !== 1 ? "s" : ""} today`}
        </p>
      </div>

      {/* ── Onboarding ──────────────────────────────────────────────────── */}
      {showOnboarding && (
        <Card style={{ marginBottom: "var(--space-6)", borderLeft: "4px solid var(--accent)" }}>
          <div style={{ padding: "var(--space-5)" }}>
            <h2 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}>
              Welcome to Dovetails Services LLC!
            </h2>
            <p style={{ margin: "0 0 var(--space-5)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
              Follow these steps to start managing your business.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <StepDot n={1} active />
                <span style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", flex: 1 }}>Add your first client</span>
                <LinkButton href="/app/clients/new" variant="primary" size="sm">+ New Client</LinkButton>
              </div>
              {["Add a property for that client", "Create your first job", "Schedule a visit"].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", opacity: 0.4 }}>
                  <StepDot n={i + 2} active={false} />
                  <span style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {showNextStep && (
        <Card style={{ marginBottom: "var(--space-6)", borderLeft: "4px solid var(--accent)" }}>
          <div style={{ padding: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", flex: 1 }}>
              Your clients are set up. Create your first job to start tracking work.
            </p>
            <LinkButton href="/app/jobs/new" variant="primary" size="sm">+ New Job</LinkButton>
          </div>
        </Card>
      )}

      {/* ── Needs Attention ─────────────────────────────────────────────── */}
      {attentionItems.length > 0 && (
        <div style={{ marginBottom: "var(--space-6)" }}>
          <SectionHeader title="Needs Attention" count={attentionItems.length} as="h2" />
          <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {attentionItems.map((item) => {
              const borderColor = item.urgency === "high" ? "var(--color-red-500)" : item.urgency === "medium" ? "var(--color-amber-500)" : "var(--color-blue-500)";
              return (
                <Link key={`${item.kind}-${item.id}`} href={item.href as Route} style={{ textDecoration: "none" }}>
                  <Card hover padding="sm" style={{ borderLeft: `3px solid ${borderColor}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: borderColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>{item.sub}</div>
                      </div>
                      <span style={{ fontSize: "var(--text-xs)", color: borderColor, fontWeight: 600, flexShrink: 0 }}>
                        {item.urgency === "high" ? "Urgent" : "Review"} →
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Today's Schedule ────────────────────────────────────────────── */}
      {todayVisits.length > 0 && (
        <div style={{ marginBottom: "var(--space-6)" }}>
          <SectionHeader
            title="Today's Schedule"
            count={todayVisits.length}
            as="h2"
            action={
              <Link href="/app/schedule" style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>
                Full schedule →
              </Link>
            }
          />
          <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {todayVisits.map((v) => {
              const color = visitStatusColor(v.status);
              return (
                <Link key={v.id} href={`/app/visits/${v.id}` as Route} style={{ textDecoration: "none" }}>
                  <Card hover padding="sm" style={{ borderLeft: `3px solid ${color}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <div style={{ minWidth: 52, flexShrink: 0 }}>
                        <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
                          {fmtTime(v.scheduled_start)}
                        </div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                          {visitStatusLabel(v.status)}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-sm)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {v.client_name}
                        </div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {v.job_title}{v.property_address ? ` · ${v.property_address}` : ""}
                        </div>
                      </div>
                      {v.tech_name && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", flexShrink: 0, textAlign: "right" }}>
                          {v.tech_name.split(" ")[0]}
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Revenue at a Glance ─────────────────────────────────────────── */}
      <Card style={{ marginBottom: "var(--space-6)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-6)", padding: "var(--space-2) 0" }}>
          <div>
            <div style={statValue}>{fmtCents(thisWeekRev)}</div>
            <div style={statLabel}>
              This week
              {weekChange.label && (
                <span style={statChange(weekChange.up)}>
                  {weekChange.up === true ? " ▲" : weekChange.up === false ? " ▼" : " "}{weekChange.label}
                </span>
              )}
            </div>
            <div style={{ ...statLabel, marginTop: 2 }}>vs {fmtCents(lastWeekRev)} last week</div>
          </div>
          <div>
            <div style={statValue}>{fmtCents(thisMonthRev)}</div>
            <div style={statLabel}>
              This month
              {monthChange.label && (
                <span style={statChange(monthChange.up)}>
                  {monthChange.up === true ? " ▲" : monthChange.up === false ? " ▼" : " "}{monthChange.label}
                </span>
              )}
            </div>
            <div style={{ ...statLabel, marginTop: 2 }}>vs {fmtCents(lastMonthRev)} last month</div>
          </div>
          <div>
            <div style={{ ...statValue, color: totalOutstanding > 0 ? "#dc2626" : "var(--fg)" }}>
              {fmtCents(totalOutstanding)}
            </div>
            <div style={statLabel}>Outstanding AR</div>
            <div style={{ ...statLabel, marginTop: 2 }}>
              {openInvCount + overdueInvCount} invoice{openInvCount + overdueInvCount !== 1 ? "s" : ""} unpaid
            </div>
          </div>
        </div>
      </Card>

      {/* ── Estimates Pipeline ──────────────────────────────────────────── */}
      <div style={sectionLabel}>Estimates</div>
      <MetricGrid metrics={estimateMetrics} />

      {/* ── Invoicing Pipeline ──────────────────────────────────────────── */}
      <div style={sectionLabel}>Invoicing</div>
      <MetricGrid metrics={invoiceMetrics} />

      {/* ── Membership Pulse ────────────────────────────────────────────── */}
      {memberActive > 0 && (
        <>
          <div style={{ ...sectionLabel, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Membership</span>
            <Link href={"/app/membership-dashboard" as Route} style={{ fontSize: "var(--text-xs)", fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--fg-link)", textDecoration: "none" }}>
              Full dashboard →
            </Link>
          </div>
          <MetricGrid metrics={membershipMetrics} />
        </>
      )}

      {/* ── Quick Actions ───────────────────────────────────────────────── */}
      <div style={sectionLabel}>Quick Actions</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "var(--space-3)" }}>
        <QuickActionCard href="/app/clients/new" icon="user-plus" label="New Client" />
        <QuickActionCard href="/app/jobs/new"     icon="briefcase" label="New Job" />
        <QuickActionCard href="/app/estimates/new" icon="doc"      label="New Estimate" />
        <QuickActionCard href="/app/schedule"      icon="calendar" label="Schedule" />
        <QuickActionCard href="/app/invoices"      icon="dollar"   label="Invoices" />
      </div>

    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------------

function StepDot({ n, active }: { n: number; active: boolean }) {
  return (
    <span style={{
      width: 28, height: 28, borderRadius: "50%",
      background: active ? "var(--accent)" : "var(--border)",
      color: active ? "var(--fg-inverse)" : "var(--fg-muted)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: "var(--text-xs)", fontWeight: "var(--font-bold)", flexShrink: 0,
    }}>{n}</span>
  );
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  "user-plus": (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="7" r="3" />
      <path d="M2 18c0-3.3 2.7-6 6-6" />
      <path d="M15 11h6M18 8v6" />
    </svg>
  ),
  briefcase: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <path d="M6 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  doc: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M12 2v4h4M7 10h6M7 13h4" />
    </svg>
  ),
  calendar: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="16" height="14" rx="2" />
      <path d="M14 2v4M6 2v4M2 9h16" />
    </svg>
  ),
  dollar: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 4v12M13 7.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2.5 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5" />
    </svg>
  ),
};

function QuickActionCard({ href, icon, label }: { href: Route; icon: string; label: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <Card hover padding="default" style={{ textAlign: "center", cursor: "pointer" }}>
        <div style={{ color: "var(--accent)", marginBottom: "var(--space-2)", lineHeight: 1 }}>
          {ICON_PATHS[icon]}
        </div>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", color: "var(--fg)" }}>{label}</div>
      </Card>
    </Link>
  );
}
