import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader } from "@/components/ui";
import { ActionQueue, JobsToday, Materials } from "./WorkdayPanel";
import type { CommandVisit, CountAction, MaterialJob } from "./WorkdayPanel";
import { OWNER_QUICK_ACTIONS } from "@/lib/navigation/quick-actions";

// EPIC-006 TASK-030: the Owner Dashboard — "run the business." Business widgets
// only (revenue, action queue, today's jobs, materials, tomorrow, quick links).
// The field workday (Start/End Day, vehicle, activity, mileage) lives on My Day.

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

type InvoiceAging = { current: number; d30: number; d60: number; d90: number };
type TechProductivity = { name: string; completed: number };

export function OwnerDashboard({
  actionQueue,
  todayJobs,
  materialCount,
  materialJobs,
  tomorrowJobs,
  outstandingInvoicesCents = 0,
  pendingDepositsCents = 0,
  paidThisMonthCents = 0,
  invoiceAging,
  techProductivity = [],
}: {
  actionQueue: CountAction[];
  todayJobs: CommandVisit[];
  materialCount: number;
  materialJobs: MaterialJob[];
  tomorrowJobs: CommandVisit[];
  outstandingInvoicesCents?: number;
  pendingDepositsCents?: number;
  paidThisMonthCents?: number;
  invoiceAging?: InvoiceAging;
  techProductivity?: TechProductivity[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {/* What needs my attention */}
      <ActionQueue items={actionQueue} />

      <div
        style={{
          display: "grid",
          gap: "var(--space-5)",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          alignItems: "start",
        }}
        className="owner-dashboard-grid"
      >
        {/* Left: operations */}
        <div className="owner-dash-col" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <div className="owner-dash-jobs"><JobsToday jobs={todayJobs} readOnly /></div>
          <div className="owner-dash-materials"><Materials count={materialCount} jobs={materialJobs} /></div>

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

        {/* Right: money + quick links */}
        <div className="owner-dash-col" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          <Card className="owner-dash-money" style={{ padding: "var(--space-4)" }}>
            <SectionHeader title="Financial Snapshot" />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
              <div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>Outstanding Invoices</span>
                <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--color-red-600)" }}>{dollars(outstandingInvoicesCents)}</div>
              </div>
              <div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>Deposits Pending</span>
                <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--color-amber-600)" }}>{dollars(pendingDepositsCents)}</div>
              </div>
              <div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>Collected This Month</span>
                <div style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--color-green-600)" }}>{dollars(paidThisMonthCents)}</div>
              </div>
            </div>
            <div style={{ marginTop: "var(--space-4)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
              <Link href={"/app/reports" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-xs)", fontWeight: 600, textDecoration: "none" }}>
                View Full Reports →
              </Link>
            </div>
          </Card>

          {invoiceAging ? (
            <Card className="owner-dash-aging" style={{ padding: "var(--space-4)" }}>
              <SectionHeader title="Invoice Aging" />
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                {[
                  { label: "Current", v: invoiceAging.current, color: "var(--fg-default)" },
                  { label: "1–30 days", v: invoiceAging.d30, color: "var(--color-amber-600)" },
                  { label: "31–60 days", v: invoiceAging.d60, color: "var(--color-amber-600)" },
                  { label: "60+ days", v: invoiceAging.d90, color: "var(--color-red-600)" },
                ].map((b) => (
                  <div key={b.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{b.label}</span>
                    <span style={{ fontWeight: 700, color: b.color }}>{dollars(b.v)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="owner-dash-completed" style={{ padding: "var(--space-4)" }}>
            <SectionHeader title="Completed This Month" />
            {techProductivity.length === 0 ? (
              <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: "var(--space-2) 0 0" }}>No visits completed yet this month.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                {techProductivity.map((t) => (
                  <div key={t.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "var(--text-sm)" }}>{t.name}</span>
                    <span style={{ fontWeight: 700 }}>{t.completed} visit{t.completed !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="owner-dash-actions" style={{ padding: "var(--space-4)" }}>
            <SectionHeader title="Quick Actions" />
            <div className="quick-actions-grid" style={{ marginTop: "var(--space-3)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
              {OWNER_QUICK_ACTIONS.map((act) => (
                <Link
                  key={act.label}
                  href={act.href as Route}
                  style={{
                    display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center",
                    padding: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                    textDecoration: "none", color: "inherit", background: "var(--bg-card)", textAlign: "center",
                    minHeight: 74, fontSize: 11, fontWeight: 600, boxShadow: "var(--shadow-xs)",
                  }}
                  className="p7-card-hover"
                >
                  <span style={{ fontSize: 18 }}>{act.icon}</span>
                  <span>{act.label}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
