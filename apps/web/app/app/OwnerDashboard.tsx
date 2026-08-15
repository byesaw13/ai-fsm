import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader, MetricGrid, StatusStepper, LinkButton } from "@/components/ui";
import { ActionQueue, JobsToday, Materials } from "./DashboardWidgets";
import type { CommandVisit, CountAction, MaterialJob } from "./DashboardWidgets";
import { OWNER_QUICK_ACTIONS } from "@/lib/navigation/quick-actions";
import { formatCents } from "@/lib/money";
import type { OpenSession, VehicleOption } from "@/lib/my-work/field-day-types";

// EPIC-006 / mockup merge: single-screen dashboard. Combines the field workday
// (Start Day, vehicle, mileage — from loadFieldDayData) with the business
// widgets (schedule, action queue, expenses, revenue) so the owner runs the
// whole day from one screen. The full interactive Start-Day wizard still lives
// on /app/my-work; here we show a summary + CTA into it.

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const WORKFLOW_STEPS = [
  { key: "start", label: "Start Day" },
  { key: "work", label: "Work Day" },
  { key: "follow", label: "Follow Ups" },
  { key: "end", label: "End Day" },
];

export function OwnerDashboard({
  actionQueue,
  todayJobs,
  materialCount,
  materialJobs,
  tomorrowJobs,
  outstandingInvoicesCents = 0,
  pendingDepositsCents = 0,
  paidThisMonthCents = 0,
  openSession,
  vehicles,
  dayMileage,
  yesterdayMiles,
  pendingSegments,
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
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  dayMileage: { totalMiles: number; openSessions: number };
  yesterdayMiles: number;
  pendingSegments: number;
  todayExpensesCents: number;
  monthExpensesCents: number;
  receiptsMissing: number;
}) {
  const dayStarted = !!openSession;
  const startedJobs = todayJobs.filter(
    (j) => j.visit_status === "in_progress" || j.visit_status === "arrived",
  ).length;
  const todaysVehicle = openSession
    ? { name: openSession.vehicle_nickname ?? "Vehicle", odometer: openSession.start_odometer }
    : vehicles[0]
      ? { name: vehicles[0].nickname, odometer: vehicles[0].current_odometer }
      : null;

  // Right-rail "Today's Workflow" checklist — derived from live state.
  const workflowChecklist: { label: string; status: string; alert?: boolean }[] = [
    { label: "Start Day", status: dayStarted ? "Started" : "Not started", alert: !dayStarted },
    { label: "Jobs", status: `${startedJobs} of ${todayJobs.length} started` },
    {
      label: "Expenses & Receipts",
      status: receiptsMissing > 0 ? `${receiptsMissing} to upload` : "Up to date",
      alert: receiptsMissing > 0,
    },
    {
      label: "Mileage",
      status: pendingSegments > 0 ? `${pendingSegments} to log` : `${dayMileage.totalMiles} mi today`,
      alert: pendingSegments > 0,
    },
    {
      label: "Follow Ups",
      status: actionQueue.length > 0 ? `${actionQueue.length} pending` : "Clear",
      alert: actionQueue.length > 0,
    },
    { label: "End Day", status: dayStarted ? "When you're done" : "—" },
  ];

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
      {/* ---- DAILY WORKFLOW ---- */}
      <Card>
        <SectionHeader title="Daily Workflow" />
        <StatusStepper steps={WORKFLOW_STEPS} currentStep={dayStarted ? "work" : "start"} />

        <div
          style={{
            marginTop: "var(--space-4)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-4)",
            display: "flex",
            gap: "var(--space-4)",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: "240px", flex: "1 1 auto" }}>
            <h3 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 }}>
              {dayStarted ? "Your day is underway" : "Start Your Day"}
            </h3>
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: "var(--space-1) 0 var(--space-3)" }}>
              {dayStarted
                ? "Vehicle and starting mileage are logged. Keep working from My Day."
                : "Record your starting mileage to keep your day on track."}
            </p>
            <LinkButton href="/app/my-work" variant="primary" size="sm">
              {dayStarted ? "Continue in My Day" : "Record Starting Mileage"}
            </LinkButton>
          </div>

          {todaysVehicle && (
            <div style={{ textAlign: "right", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              <div>Today&apos;s Vehicle</div>
              <div style={{ color: "var(--fg)", fontWeight: 600 }}>{todaysVehicle.name}</div>
              <div style={{ marginTop: "var(--space-2)" }}>
                {dayStarted ? "Starting Mileage" : "Last Recorded"}
              </div>
              <div style={{ color: "var(--accent)", fontSize: "var(--text-2xl)", fontWeight: 700 }}>
                {todaysVehicle.odometer != null ? `${todaysVehicle.odometer.toLocaleString()} mi` : "—"}
              </div>
            </div>
          )}
        </div>
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

          {/* Expenses + Mileage */}
          <div className="owner-dash-row2">
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

            <Card className="owner-dash-mileage">
              <SectionHeader title="Mileage" action={viewAll("/app/timeline", "Vehicle tracking")} />
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                  <span style={{ color: "var(--fg-muted)" }}>Today Driven</span>
                  <strong style={{ color: dayMileage.totalMiles === 0 ? "var(--color-danger)" : "var(--fg)" }}>
                    {dayMileage.totalMiles} mi
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                  <span style={{ color: "var(--fg-muted)" }}>Trips to Log</span>
                  <strong style={{ color: pendingSegments > 0 ? "var(--color-danger)" : "var(--fg)" }}>{pendingSegments}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)" }}>
                  <span style={{ color: "var(--fg-muted)" }}>Yesterday</span>
                  <strong>{yesterdayMiles} mi</strong>
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <LinkButton href="/app/timeline" variant="secondary" size="sm">Open tracking</LinkButton>
                <LinkButton href="/app/mileage" variant="ghost" size="sm">Mileage log</LinkButton>
              </div>
            </Card>
          </div>

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
          {/* Today's Workflow checklist */}
          <Card>
            <SectionHeader title="Today's Workflow" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              {workflowChecklist.map((item) => (
                <div
                  key={item.label}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) 0", borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{item.label}</span>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: item.alert ? "var(--color-danger)" : "var(--fg-muted)" }}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "var(--space-3)" }}>
              <LinkButton href="/app/my-work" variant="secondary" size="sm">View Full Workflow</LinkButton>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="owner-dash-actions">
            <SectionHeader title="Quick Actions" />
            <div className="owner-dash-qa-grid">
              {OWNER_QUICK_ACTIONS.map((qa) => (
                <Link
                  key={qa.label}
                  href={qa.href as Route}
                  className="p7-card-hover"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-3) var(--space-1)",
                    borderRadius: "var(--radius-md)",
                    textDecoration: "none",
                    color: "var(--fg)",
                    textAlign: "center",
                  }}
                >
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
                </Link>
              ))}
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
