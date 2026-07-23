import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader } from "@/components/ui";
import { formatCents } from "@/lib/money";
import type { TaskScheduleMismatch } from "@/lib/jobs/project-launch";

/**
 * The project control-panel board: one structured index of every project
 * artifact (money spine, field state, work state). Replaces the launch-pad
 * chip row and the Money & scope strip so each artifact is linked exactly once
 * at the top of the page.
 */

type MoneyDoc = {
  id: string;
  number: string | null;
  status: string | null;
  totalCents: number | null;
};

export type ProjectOverviewProps = {
  jobId: string;
  mismatch: TaskScheduleMismatch | null;
  estimate: MoneyDoc | null;
  approvedEstimateId: string | null;
  deposit: (MoneyDoc & { paid: boolean }) | null;
  hasApprovedEstimate: boolean;
  invoice: MoneyDoc | null;
  assessment: { visitId: string; done: boolean | null } | null;
  workDayCount: number;
  nextDay: { visitId: string; label: string } | null;
  tasks: { total: number; done: number; percent: number; unplanned: number };
  workOrderCount: number;
};

const cellLabelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  color: "var(--fg-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const cellLinkStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "var(--accent)",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: "var(--text-sm)",
};

const cellSubLinkStyle: React.CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "var(--accent)",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "var(--text-sm)",
};

function CellEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
      {children}
    </p>
  );
}

function moneyLine(doc: MoneyDoc, fallbackLabel: string, statusOverride?: string) {
  const parts = [doc.number ?? fallbackLabel, statusOverride ?? doc.status ?? "—"];
  if (doc.totalCents != null) parts.push(formatCents(doc.totalCents));
  return `${parts.join(" · ")} →`;
}

export function ProjectOverview(props: ProjectOverviewProps) {
  const { jobId, mismatch, tasks } = props;

  return (
    <Card data-testid="project-overview" style={{ marginBottom: "var(--space-4)" }}>
      <SectionHeader title="Overview" />

      {mismatch ? (
        <div
          data-testid="project-wo-mismatch"
          role="status"
          style={{
            marginBottom: "var(--space-3)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--warning, #b45309)",
            background: "var(--warning-bg, #fffbeb)",
            fontSize: "var(--text-sm)",
            lineHeight: 1.45,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, color: "var(--fg)" }}>Work order mismatch</p>
          <p style={{ margin: "6px 0 0", color: "var(--fg)" }}>{mismatch.message}</p>
          <p style={{ margin: "10px 0 0", display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link
              href={`/app/work-orders/${mismatch.tasksWo.id}` as Route}
              style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
            >
              Open tasks WO →
            </Link>
            <Link
              href={`/app/jobs/${jobId}/visits/new?work_order_id=${mismatch.tasksWo.id}` as Route}
              style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
            >
              Schedule on tasks WO →
            </Link>
            <Link
              href={`/app/work-orders/${mismatch.calendarWo.id}` as Route}
              style={{ color: "var(--fg-muted)", fontWeight: 600, textDecoration: "none" }}
            >
              Calendar WO
            </Link>
          </p>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: "var(--space-3)",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
      >
        <div>
          <p style={cellLabelStyle}>Estimate</p>
          {props.estimate ? (
            <>
              <Link href={`/app/estimates/${props.estimate.id}` as Route} style={cellLinkStyle}>
                {moneyLine(props.estimate, "Estimate")}
              </Link>
              {props.approvedEstimateId ? (
                <Link
                  href={`/app/estimates/${props.approvedEstimateId}/shopping-list` as Route}
                  style={cellSubLinkStyle}
                >
                  Materials plan →
                </Link>
              ) : null}
            </>
          ) : (
            <CellEmpty>None yet</CellEmpty>
          )}
        </div>

        <div>
          <p style={cellLabelStyle}>Deposit</p>
          {props.deposit ? (
            <Link href={`/app/invoices/${props.deposit.id}` as Route} style={cellLinkStyle}>
              {moneyLine(props.deposit, "Deposit", props.deposit.paid ? "paid" : undefined)}
            </Link>
          ) : (
            <CellEmpty>{props.hasApprovedEstimate ? "None required / not created" : "—"}</CellEmpty>
          )}
        </div>

        <div>
          <p style={cellLabelStyle}>Final invoice</p>
          {props.invoice ? (
            <Link href={`/app/invoices/${props.invoice.id}` as Route} style={cellLinkStyle}>
              {moneyLine(props.invoice, "Invoice")}
            </Link>
          ) : (
            <CellEmpty>After owner completes project</CellEmpty>
          )}
        </div>

        <div>
          <p style={cellLabelStyle}>Field</p>
          {props.assessment ? (
            <Link
              href={`/app/visits/${props.assessment.visitId}/assessment` as Route}
              data-testid="project-field-assessment-link"
              style={cellLinkStyle}
            >
              Assessment
              {props.assessment.done === true ? " · done" : props.assessment.done === false ? " · open" : ""}{" "}
              →
            </Link>
          ) : (
            <CellEmpty>No assessment</CellEmpty>
          )}
          {props.nextDay ? (
            <Link
              href={`/app/visits/${props.nextDay.visitId}` as Route}
              data-testid="project-field-day-link"
              style={cellSubLinkStyle}
            >
              {props.workDayCount} work day{props.workDayCount === 1 ? "" : "s"}
              {props.nextDay.label ? ` · ${props.nextDay.label}` : ""} →
            </Link>
          ) : (
            <CellEmpty>
              {props.workDayCount} work day{props.workDayCount === 1 ? "" : "s"}
            </CellEmpty>
          )}
        </div>

        <div>
          <p style={cellLabelStyle}>Tasks</p>
          {tasks.total > 0 ? (
            <>
              <a href="#job-tasks" data-testid="project-overview-tasks" style={cellLinkStyle}>
                {tasks.done}/{tasks.total} done · {tasks.percent}% →
              </a>
              {tasks.unplanned > 0 ? (
                <a
                  href="#job-unplanned"
                  data-testid="project-overview-unplanned"
                  style={{ ...cellSubLinkStyle, color: "var(--warning, #b45309)" }}
                >
                  {tasks.unplanned} not on a day →
                </a>
              ) : null}
            </>
          ) : (
            <CellEmpty>No field tasks yet</CellEmpty>
          )}
        </div>

        <div>
          <p style={cellLabelStyle}>Work orders</p>
          {props.workOrderCount > 0 ? (
            <a href="#job-work-orders" style={cellLinkStyle}>
              {props.workOrderCount} work order{props.workOrderCount === 1 ? "" : "s"} →
            </a>
          ) : (
            <CellEmpty>None yet</CellEmpty>
          )}
        </div>
      </div>
    </Card>
  );
}
