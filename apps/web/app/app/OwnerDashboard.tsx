import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader, MetricGrid, LinkButton } from "@/components/ui";
import { ActionQueue, JobsToday, Materials } from "./DashboardWidgets";
import type { CommandVisit, CountAction, MaterialJob } from "./DashboardWidgets";
import { OWNER_QUICK_ACTIONS } from "@/lib/navigation/quick-actions";
import { CAPTURE_HREF, CaptureLink } from "@/components/CaptureLink";
import { formatCents } from "@/lib/money";
import { formatBusinessTime } from "@/lib/time/business-tz";
// Overview is the office numbers screen (TASK-129). Start Day / vehicle /
// mileage live on My Day — this page links there instead of duplicating them.

function fmtTime(iso: string): string {
  return formatBusinessTime(iso);
}

export function OwnerDashboard({
  actionQueue,
  todayJobs,
  materialCount,
  materialJobs,
  tomorrowJobs,
  outstandingInvoicesCents = 0,
  pendingDepositsCents = 0,
  paidThisMonthCents = 0,
  todayExpensesCents,
  monthExpensesCents,
  receiptsMissing,
}: {
  actionQueue: CountAction[];
  todayJobs: CommandVisit[];
  materialCount: number;
  materialJobs: MaterialJob[];
  tomorrowJobs: CommandVisit[];
  outstandingInvoicesCents?: number;
  pendingDepositsCents?: number;
  paidThisMonthCents?: number;
  todayExpensesCents: number;
  monthExpensesCents: number;
  receiptsMissing: number;
}) {

  const viewAll = (href: string, label = "View All") => (
    <Link
      href={href as Route}
      style={{ color: "var(--accent)", fontSize: "var(--text-sm)", fontWeight: 600, textDecoration: "none" }}
    >
      {label}
    </Link>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <Card data-testid="go-to-my-day">
        <SectionHeader title="The day lives on My Day" />
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: "0 0 var(--space-3)" }}>
          Start Day, today&apos;s work, needs-attention, and the day&apos;s timeline are one screen. This page is the office numbers.
        </p>
        <LinkButton href="/app/my-work" variant="primary" size="sm">
          Go to My Day
        </LinkButton>
      </Card>

      {/* ---- MAIN GRID: operations (left) + rail (right) ---- */}
      <div
        style={{
          display: "grid",
          gap: "var(--space-6)",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          alignItems: "start",
        }}
        className="owner-dashboard-grid"
      >
        <div className="owner-dash-col" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {/* Schedule + Tasks */}
          <div className="owner-dash-row2">
            <div className="owner-dash-jobs"><JobsToday jobs={todayJobs} readOnly /></div>
            <div className="owner-dash-tasks">
              <Card>
                <SectionHeader title="Tasks & Follow Ups" count={actionQueue.length} />
                <ActionQueue items={actionQueue} />
              </Card>
            </div>
          </div>

          <Card className="owner-dash-expenses">
            <SectionHeader title="Expenses & Receipts" action={viewAll("/app/expenses")} />
            {receiptsMissing > 0 && (
              <p style={{ color: "var(--color-danger)", fontWeight: 700, fontSize: "var(--text-sm)", margin: "0 0 var(--space-3)" }}>
                {receiptsMissing} receipt{receiptsMissing !== 1 ? "s" : ""} to upload
              </p>
            )}
            <div style={{ display: "flex", gap: "var(--space-8)", marginBottom: "var(--space-4)" }}>
              <div>
                <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Today&apos;s Expenses</div>
                <div style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>{formatCents(todayExpensesCents)}</div>
              </div>
              <div>
                <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>This Month</div>
                <div style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>{formatCents(monthExpensesCents)}</div>
              </div>
            </div>
            <LinkButton href="/app/expenses/new" variant="secondary" size="sm">+ Add Expense</LinkButton>
          </Card>

          <div className="owner-dash-materials" id="materials">
            <Materials count={materialCount} jobs={materialJobs} />
          </div>

          <Card className="owner-dash-tomorrow">
            <SectionHeader title="Tomorrow's Plan" count={tomorrowJobs.length} />
            {tomorrowJobs.length === 0 ? (
              <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: 0 }}>No visits scheduled tomorrow.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {tomorrowJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={(job.visit_id ? `/app/visits/${job.visit_id}` : `/app/jobs/${job.id}`) as Route}
                    style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", textDecoration: "none", color: "inherit", background: "var(--bg-card)" }}
                  >
                    <span><strong>{job.scheduled_start ? fmtTime(job.scheduled_start) : "—"}</strong> · {job.title}</span>
                    <small style={{ color: "var(--fg-muted)" }}>{job.client_name}</small>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ---- RIGHT RAIL ---- */}
        <div className="owner-dash-col" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {/* Quick Actions */}
          <Card className="owner-dash-actions">
            <SectionHeader title="Quick Actions" />
            <div className="owner-dash-qa-grid">
              {OWNER_QUICK_ACTIONS.map((qa) => {
                const tileStyle = {
                  display: "flex" as const,
                  flexDirection: "column" as const,
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-3) var(--space-1)",
                  borderRadius: "var(--radius-md)",
                  textDecoration: "none",
                  color: "var(--fg)",
                  textAlign: "center" as const,
                };
                const tile = (
                  <>
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: "42px",
                        height: "42px",
                        borderRadius: "var(--radius-lg)",
                        background: "var(--accent-subtle)",
                        fontSize: "1.25rem",
                      }}
                    >
                      {qa.icon}
                    </span>
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>{qa.label}</span>
                  </>
                );
                if (qa.href === CAPTURE_HREF) {
                  return (
                    <CaptureLink key={qa.label} className="p7-card-hover" style={tileStyle}>
                      {tile}
                    </CaptureLink>
                  );
                }
                return (
                  <Link
                    key={qa.label}
                    href={qa.href as Route}
                    className="p7-card-hover"
                    style={tileStyle}
                  >
                    {tile}
                  </Link>
                );
              })}
            </div>
          </Card>

          {/* At a Glance */}
          <Card className="owner-dash-money">
            <SectionHeader title="At a Glance" action={viewAll("/app/reports", "Reports →")} />
            <MetricGrid
              metrics={[
                { label: "Collected (Month)", value: formatCents(paidThisMonthCents), variant: "success" },
                { label: "Outstanding", value: formatCents(outstandingInvoicesCents), variant: outstandingInvoicesCents > 0 ? "alert" : "default" },
                { label: "Deposits Pending", value: formatCents(pendingDepositsCents) },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
