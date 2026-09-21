import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader, MetricGrid, LinkButton } from "@/components/ui";
import { NeedsAttentionPanel } from "./NeedsAttentionPanel";
import type { CommandVisit } from "./DashboardWidgets";
import type { NeedsAttentionItem } from "@/lib/attention/load-needs-attention";
import type { OpenOwnerPromiseRow } from "@/lib/captures/promise-queue";
import { formatCents } from "@/lib/money";
import { formatBusinessTime } from "@/lib/time/business-tz";

function fmtTime(iso: string): string {
  return formatBusinessTime(iso);
}

export function OwnerDashboard({
  leakItems,
  openPromiseRows,
  tomorrowJobs,
  outstandingInvoicesCents = 0,
  paidThisMonthCents = 0,
}: {
  leakItems: NeedsAttentionItem[];
  openPromiseRows: OpenOwnerPromiseRow[];
  tomorrowJobs: CommandVisit[];
  outstandingInvoicesCents?: number;
  paidThisMonthCents?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <NeedsAttentionPanel items={leakItems} openPromiseRows={openPromiseRows} />

      {leakItems.length === 0 ? (
        <p
          data-testid="overview-nothing-leaking"
          style={{ margin: "-var(--space-3) 0 0", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}
        >
          Nothing leaking. The day is on{" "}
          <Link href={"/app/my-work" as Route} style={{ color: "var(--accent)", fontWeight: 600 }}>
            Today
          </Link>
          .
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: "var(--space-6)",
          gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 340px)",
          alignItems: "start",
        }}
        className="owner-dashboard-grid"
      >
        <Card className="owner-dash-tomorrow">
          <SectionHeader title="Tomorrow" count={tomorrowJobs.length} />
          {tomorrowJobs.length === 0 ? (
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", margin: 0 }}>
              No visits scheduled tomorrow.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {tomorrowJobs.map((job) => (
                <Link
                  key={job.id}
                  href={(job.visit_id ? `/app/visits/${job.visit_id}` : `/app/jobs/${job.id}`) as Route}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "var(--space-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    textDecoration: "none",
                    color: "inherit",
                    background: "var(--bg-card)",
                  }}
                >
                  <span>
                    <strong>{job.scheduled_start ? fmtTime(job.scheduled_start) : "—"}</strong>
                    {" · "}
                    {job.title}
                  </span>
                  <small style={{ color: "var(--fg-muted)" }}>{job.client_name}</small>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="owner-dash-money" data-testid="overview-money-rail">
          <SectionHeader
            title="Money"
            action={
              <Link href={"/app/reports" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-sm)", fontWeight: 600, textDecoration: "none" }}>
                Reports →
              </Link>
            }
          />
          <MetricGrid
            metrics={[
              {
                label: "Collected (month)",
                value: formatCents(paidThisMonthCents),
                variant: "success",
              },
              {
                label: "Outstanding",
                value: formatCents(outstandingInvoicesCents),
                variant: outstandingInvoicesCents > 0 ? "alert" : "default",
              },
            ]}
          />
        </Card>
      </div>

      <p style={{ margin: 0 }}>
        <LinkButton href="/app/my-work" variant="secondary" size="sm" data-testid="go-to-my-day">
          Go to Today
        </LinkButton>
      </p>
    </div>
  );
}
