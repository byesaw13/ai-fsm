import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withDbSession } from "@/lib/db";
import { appUrl } from "@/lib/email/mailer";
import { isSmsGatewayConfigured } from "@/lib/sms/gateway";
import { loadReportEditor } from "@/lib/job-reports/load";
import { Breadcrumbs, PageContainer, PageHeader } from "@/components/ui";
import { CustomerReportEditor } from "./CustomerReportEditor";

export const dynamic = "force-dynamic";

/** /app/jobs/[id]/customer-report — TASK-162: review and publish a Job Report. */
export default async function CustomerReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin") redirect("/app");
  const { id: jobId } = await params;

  const data = await withDbSession(session, (db) => loadReportEditor(db, session.accountId, jobId));
  if (!data) notFound();

  const r = data.recipient;
  // A bare skip marker (TASK-163) has no content — start from the fresh pre-fill.
  const savedContent =
    data.report && !(data.report.status === "skipped" && !data.report.summary && data.report.media_ids.length === 0)
      ? data.report
      : null;
  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: "Jobs", href: "/app/jobs" },
          { label: data.job.title, href: `/app/jobs/${jobId}` },
          { label: "Customer report" },
        ]}
      />
      <PageHeader
        title="Customer report"
        subtitle={r.ok ? `Goes to ${r.name ?? "the customer"}${data.job.address ? ` · ${data.job.address}` : ""}` : data.job.title}
      />
      <CustomerReportEditor
        jobId={jobId}
        blockedReason={r.ok ? null : r.reason}
        sponsored={r.ok && r.sponsored}
        canEmail={r.ok && !!r.email}
        canText={r.ok && !!r.phone && !!r.smsConsent && isSmsGatewayConfigured()}
        photos={data.photos}
        materialLines={data.materialLines}
        initial={
          savedContent
            ? {
                title: savedContent.title,
                summary: savedContent.summary,
                area: savedContent.area,
                work_type: savedContent.work_type,
                media_ids: savedContent.media_ids,
                records: savedContent.records,
              }
            : {
                title: data.prefill.title,
                summary: data.prefill.summary,
                area: null,
                work_type: null,
                // "After" photos preselected; the rest are one tap away.
                media_ids: data.photos.filter((p) => p.category === "after").slice(0, 12).map((p) => p.id),
                records: [],
              }
        }
        status={data.report?.status ?? null}
        url={data.report && data.report.status === "published" ? `${appUrl()}/portal/reports/${data.report.share_token}` : null}
        views={data.report?.view_count ?? 0}
      />
    </PageContainer>
  );
}
