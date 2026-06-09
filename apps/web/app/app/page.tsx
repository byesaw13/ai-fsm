import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { Card, EmptyState, ItemCard, LinkButton, PageContainer, PageHeader, SectionHeader, StatusBadge } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";

export const dynamic = "force-dynamic";

type CountRow = { count: string };

type TodayJobRow = {
  id: string;
  title: string;
  status: string;
  client_name: string | null;
  property_address: string | null;
  visit_id: string | null;
  scheduled_start: string | null;
  visit_status: string | null;
};

type TodayEstimateRow = {
  id: string;
  status: string;
  total_cents: string;
  client_name: string | null;
  job_title: string | null;
  activity_at: string;
};

type TodayInvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  total_cents: string;
  balance_cents: string;
  client_name: string | null;
  job_title: string | null;
  activity_at: string;
};

type ActionQueueItem = {
  label: string;
  count: number;
  href: Route;
  detail: string;
  tone: "danger" | "warning" | "default";
};

function parseN(row: CountRow | undefined | null): number {
  return parseInt(row?.count ?? "0", 10);
}

function fmt(cents: number | string): string {
  const n = Number(cents);
  return `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "Today";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function TodaySection({ title, count, href, children }: { title: string; count: number; href?: Route; children: ReactNode }) {
  return (
    <Card>
      <SectionHeader
        title={title}
        count={count}
        action={href ? <LinkButton href={href} variant="ghost" size="sm">View all</LinkButton> : undefined}
      />
      {children}
    </Card>
  );
}

function EmptyToday({ label }: { label: string }) {
  return <EmptyState title={label} description="Only active work for today appears here." />;
}

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const [
    todayJobs,
    todayEstimates,
    todayFollowUps,
    todayInvoices,
    draftInvoiceCountRows,
    scheduleApprovedCountRows,
    estimateFollowUpCountRows,
    depositCountRows,
    materialCountRows,
  ] = await Promise.all([
    queryForSession<TodayJobRow>(session,
      `SELECT DISTINCT ON (j.id)
              j.id, j.title, j.status,
              c.name AS client_name,
              p.address AS property_address,
              v.id AS visit_id,
              v.scheduled_start::text AS scheduled_start,
              v.status AS visit_status
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = j.account_id
       WHERE j.account_id = $1
         AND j.status IN ('draft','quoted','scheduled','in_progress')
         AND v.status IN ('scheduled','arrived','in_progress')
         AND v.scheduled_start::date = CURRENT_DATE
       ORDER BY j.id, v.scheduled_start ASC
       LIMIT 5`,
      [accountId]),

    queryForSession<TodayEstimateRow>(session,
      `SELECT e.id, e.status, e.total_cents::text AS total_cents,
              c.name AS client_name, j.title AS job_title,
              COALESCE(e.sent_at, e.created_at)::text AS activity_at
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.account_id = $1
         AND e.status IN ('draft','sent','approved')
         AND COALESCE(e.sent_at, e.created_at)::date = CURRENT_DATE
       ORDER BY COALESCE(e.sent_at, e.created_at) DESC
       LIMIT 5`,
      [accountId]),

    queryForSession<TodayEstimateRow>(session,
      `SELECT e.id, e.status, e.total_cents::text AS total_cents,
              c.name AS client_name, j.title AS job_title,
              COALESCE(e.expires_at, e.sent_at, e.created_at)::text AS activity_at
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.account_id = $1
         AND e.status = 'sent'
         AND (
           e.expires_at::date = CURRENT_DATE
           OR e.sent_at::date = CURRENT_DATE
         )
       ORDER BY COALESCE(e.expires_at, e.sent_at, e.created_at) ASC
       LIMIT 5`,
      [accountId]),

    queryForSession<TodayInvoiceRow>(session,
      `SELECT i.id, i.invoice_number, i.status,
              i.total_cents::text AS total_cents,
              i.balance_cents::text AS balance_cents,
              c.name AS client_name, j.title AS job_title,
              COALESCE(i.due_date, i.sent_at, i.created_at)::text AS activity_at
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN jobs j ON j.id = i.job_id
       WHERE i.account_id = $1
         AND i.status IN ('draft','sent','partial','overdue')
         AND COALESCE(i.due_date, i.sent_at, i.created_at)::date = CURRENT_DATE
       ORDER BY COALESCE(i.due_date, i.sent_at, i.created_at) ASC
       LIMIT 5`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM invoices
       WHERE account_id = $1 AND status = 'draft' AND invoice_kind IN ('final', 'standard')`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM jobs
       WHERE account_id = $1
         AND status IN ('draft','quoted','scheduled','in_progress')
         AND NOT EXISTS (
           SELECT 1 FROM visits
           WHERE visits.job_id = jobs.id
             AND visits.status IN ('scheduled','arrived','in_progress')
             AND visits.scheduled_start >= CURRENT_DATE
         )`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status = 'sent'
         AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM invoices
       WHERE account_id = $1
         AND invoice_kind = 'deposit'
         AND status IN ('draft','sent','partial','overdue')`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(DISTINCT e.id)::text AS count
       FROM estimates e
       JOIN jobs j ON j.id = e.job_id AND j.account_id = e.account_id
       WHERE e.account_id = $1
         AND e.status = 'approved'
         AND j.status IN ('scheduled','in_progress')`,
      [accountId]),
  ]);

  const actionQueue = ([
    {
      label: "Review Draft Invoices",
      count: parseN(draftInvoiceCountRows[0]),
      href: "/app/invoices?status=draft" as Route,
      detail: "Draft invoices awaiting review",
      tone: "warning",
    },
    {
      label: "Schedule Approved Jobs",
      count: parseN(scheduleApprovedCountRows[0]),
      href: "/app/jobs" as Route,
      detail: "Active work without a next visit",
      tone: "warning",
    },
    {
      label: "Follow Up Estimates",
      count: parseN(estimateFollowUpCountRows[0]),
      href: "/app/estimates?status=sent" as Route,
      detail: "Sent estimates awaiting response",
      tone: "warning",
    },
    {
      label: "Collect Deposits",
      count: parseN(depositCountRows[0]),
      href: "/app/invoices?kind=deposit" as Route,
      detail: "Deposit invoices not fully collected",
      tone: "danger",
    },
    {
      label: "Order Materials",
      count: parseN(materialCountRows[0]),
      href: "/app/estimates?status=approved" as Route,
      detail: "Approved jobs with materials to stage",
      tone: "warning",
    },
  ] satisfies ActionQueueItem[])
    .filter((item) => item.count > 0)
    .sort((a, b) => ({ danger: 0, warning: 1, default: 2 })[a.tone] - ({ danger: 0, warning: 1, default: 2 })[b.tone]);

  return (
    <PageContainer>
      <PageHeader
        title="Today"
        subtitle={todayLabel}
        actions={
          <LinkButton href="/app/intake/new" variant="primary" size="sm">+ New Request</LinkButton>
        }
      />

      {/* Hero: the single prioritized "do this next" list */}
      <Card>
        <SectionHeader title="What needs you" count={actionQueue.length} />
        {actionQueue.length === 0 ? (
          <EmptyState
            title="You're all caught up"
            description="Nothing needs action right now. New work shows up here as estimates, jobs, and invoices move."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {actionQueue.map((item) => {
              const accent = item.tone === "danger" ? "var(--color-danger)" : item.tone === "warning" ? "var(--color-warning)" : "var(--accent)";
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)",
                    padding: "var(--space-3)", borderRadius: "var(--radius)",
                    border: "1px solid var(--border)", borderLeft: `4px solid ${accent}`,
                    textDecoration: "none", color: "inherit", background: "var(--bg-card)",
                  }}
                >
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <strong style={{ fontSize: "var(--text-base)" }}>{item.label}</strong>
                    <small style={{ color: "var(--fg-muted)" }}>{item.detail}</small>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", whiteSpace: "nowrap" }}>
                    <b style={{ fontSize: "var(--text-lg)", color: accent }}>{item.count}</b>
                    <span style={{ color: "var(--fg-muted)" }}>→</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {/* Secondary: what's on the calendar today (context, not actions) */}
      <h2 style={{ fontSize: "var(--text-sm)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)", margin: "var(--space-6) 0 var(--space-3)" }}>
        On today
      </h2>
      <div style={{ display: "grid", gap: "var(--space-4)", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <TodaySection title="Jobs" count={todayJobs.length} href="/app/jobs">
          {todayJobs.length === 0 ? <EmptyToday label="No active jobs today" /> : (
            <div>
              {todayJobs.map((job) => (
                <ItemCard
                  key={job.id}
                  href={(job.visit_id ? `/app/visits/${job.visit_id}` : `/app/jobs/${job.id}`) as Route}
                  title={job.title}
                  titleBadge={<StatusBadge variant={job.status as StatusVariant}>{job.status.replaceAll("_", " ")}</StatusBadge>}
                  meta={<span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{fmtTime(job.scheduled_start)} · {job.client_name ?? "Client"}{job.property_address ? ` · ${job.property_address}` : ""}</span>}
                />
              ))}
            </div>
          )}
        </TodaySection>

        <TodaySection title="Estimates" count={todayEstimates.length} href="/app/estimates">
          {todayEstimates.length === 0 ? <EmptyToday label="No active estimates today" /> : (
            <div>
              {todayEstimates.map((estimate) => (
                <ItemCard
                  key={estimate.id}
                  href={`/app/estimates/${estimate.id}` as Route}
                  title={estimate.client_name ?? estimate.job_title ?? "Estimate"}
                  titleBadge={<StatusBadge variant={estimate.status as StatusVariant}>{estimate.status}</StatusBadge>}
                  meta={<span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{estimate.job_title ?? "Estimate"} · {fmt(estimate.total_cents)}</span>}
                />
              ))}
            </div>
          )}
        </TodaySection>

        <TodaySection title="Follow-Ups" count={todayFollowUps.length} href="/app/estimates?status=sent">
          {todayFollowUps.length === 0 ? <EmptyToday label="No follow-ups due today" /> : (
            <div>
              {todayFollowUps.map((estimate) => (
                <ItemCard
                  key={estimate.id}
                  href={`/app/estimates/${estimate.id}` as Route}
                  title={estimate.client_name ?? estimate.job_title ?? "Estimate follow-up"}
                  meta={<span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{estimate.job_title ?? "Sent estimate"} · {fmt(estimate.total_cents)}</span>}
                />
              ))}
            </div>
          )}
        </TodaySection>

        <TodaySection title="Invoices" count={todayInvoices.length} href="/app/invoices">
          {todayInvoices.length === 0 ? <EmptyToday label="No active invoices today" /> : (
            <div>
              {todayInvoices.map((invoice) => (
                <ItemCard
                  key={invoice.id}
                  href={`/app/invoices/${invoice.id}` as Route}
                  title={invoice.invoice_number}
                  titleBadge={<StatusBadge variant={invoice.status as StatusVariant}>{invoice.status}</StatusBadge>}
                  meta={<span style={{ fontSize: "var(--text-xs)", color: invoice.status === "overdue" ? "#dc2626" : "var(--fg-muted)" }}>{invoice.client_name ?? invoice.job_title ?? "Invoice"} · {fmt(invoice.balance_cents)} due</span>}
                />
              ))}
            </div>
          )}
        </TodaySection>
      </div>
    </PageContainer>
  );
}
