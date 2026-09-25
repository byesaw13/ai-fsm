import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withDbSession } from "@/lib/db";
import { loadReportQueue } from "@/lib/job-reports/queue";
import { Breadcrumbs, Card, EmptyState, PageContainer, PageHeader } from "@/components/ui";
import { SkipReportButton } from "./SkipReportButton";

export const dynamic = "force-dynamic";

/** /app/jobs/customer-reports — TASK-163: finished jobs whose customer hasn't seen the work yet. */
export default async function CustomerReportsQueuePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin") redirect("/app");

  const rows = await withDbSession(session, (db) => loadReportQueue(db, session.accountId));

  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "Jobs", href: "/app/jobs" }, { label: "Customer reports to send" }]} />
      <PageHeader
        title="Customer reports to send"
        subtitle={rows.length === 0 ? "All caught up" : `${rows.length} finished job${rows.length === 1 ? "" : "s"} with photos the customer hasn't seen`}
      />
      {rows.length === 0 ? (
        <EmptyState title="All caught up" description="Every finished job with photos has a report, or you skipped it." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxWidth: 760 }}>
          {rows.map((r) => (
            <Card key={r.job_id} padding="sm" data-testid="report-queue-row">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{r.title}</div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    {[
                      r.client_name,
                      r.address,
                      r.finished_at ? new Date(r.finished_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null,
                      `${r.photo_count} photo${r.photo_count === 1 ? "" : "s"}`,
                    ].filter(Boolean).join(" · ")}
                  </div>
                  {(r.has_draft || !r.has_billed_invoice) && (
                    <div style={{ fontSize: "var(--text-sm)", marginTop: 4, color: r.has_billed_invoice ? "var(--fg-muted)" : "var(--fg-warning, #92400e)" }}>
                      {!r.has_billed_invoice ? "Send the invoice first — the report goes to whoever pays it." : "Draft saved"}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <Link href={`/app/jobs/${r.job_id}/customer-report` as Route} className="p7-btn p7-btn-primary p7-btn-sm">
                    {r.has_draft ? "Finish" : "Open"}
                  </Link>
                  <SkipReportButton jobId={r.job_id} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
