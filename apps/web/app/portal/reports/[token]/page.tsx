import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isPortalPreview } from "@/lib/portal/session";
import { REPORT_AREAS, REPORT_WORK_TYPES, type ReportRecord } from "@/lib/job-reports/logic";
import { BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_E164 } from "@/lib/sms/consent";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Job report",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface ReportView extends Record<string, unknown> {
  id: string;
  account_id: string;
  client_id: string;
  title: string;
  summary: string;
  area: string | null;
  work_type: string | null;
  media_ids: string[];
  records: ReportRecord[];
  published_at: string;
  address: string | null;
  business: string;
  finished_at: string | null;
}

/** /portal/reports/[token] — TASK-162 no-login Job Report. */
export default async function JobReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const report = await queryOne<ReportView>(
    `SELECT r.id::text, r.account_id::text, r.client_id::text, r.title, r.summary, r.area, r.work_type,
            r.media_ids::text[] AS media_ids, r.records, r.published_at, p.address, a.name AS business,
            (SELECT max(v.completed_at) FROM visits v WHERE v.job_id = r.job_id)::text AS finished_at
     FROM portal_job_updates r
     JOIN accounts a ON a.id = r.account_id
     LEFT JOIN properties p ON p.id = r.property_id
     WHERE r.share_token = $1 AND r.status = 'published'`,
    [token],
  );
  if (!report) notFound();

  const photos = await query<{ id: string; category: string }>(
    `SELECT id::text, category FROM visit_media
     WHERE id = ANY($1::uuid[]) AND account_id = $2 AND category <> 'receipt'`,
    [report.media_ids, report.account_id],
  );
  // Keep the owner's chosen order; lead with a before/after pair when both exist.
  const byId = new Map(photos.map((p) => [p.id, p]));
  const ordered = report.media_ids.map((id) => byId.get(id)).filter((p): p is { id: string; category: string } => !!p);
  const before = ordered.find((p) => p.category === "before");
  const after = ordered.find((p) => p.category === "after");
  const pair = before && after ? [before, after] : null;
  const rest = ordered.filter((p) => !pair?.includes(p));
  const src = (id: string) => `/api/portal/reports/${token}/media/${id}`;

  const [staff, preview] = await Promise.all([getSession(), isPortalPreview(report.client_id)]);
  if (!preview && staff?.accountId !== report.account_id) {
    await query(
      `UPDATE portal_job_updates
       SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, now())
       WHERE id = $1`,
      [report.id],
    );
  }

  const when = new Date(report.finished_at ?? report.published_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const tags = [
    report.area ? REPORT_AREAS[report.area as keyof typeof REPORT_AREAS] : null,
    report.work_type ? REPORT_WORK_TYPES[report.work_type as keyof typeof REPORT_WORK_TYPES] : null,
  ].filter(Boolean) as string[];

  return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", padding: "24px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#6b7280" }}>
          {report.business} · Job report
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "6px 0 4px" }}>{report.title}</h1>
        <div style={{ fontSize: 14, color: "#6b7280" }}>
          {[report.address, `Finished ${when}`].filter(Boolean).join(" · ")}
        </div>
        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {tags.map((t) => (
              <span key={t} style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, border: "1px solid #e5e7eb", color: "#4b5563" }}>{t}</span>
            ))}
          </div>
        )}

        {pair && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 16 }}>
            {pair.map((p) => (
              <Photo key={p.id} href={src(p.id)} label={p.category === "before" ? "Before" : "After"} />
            ))}
          </div>
        )}
        {rest.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: rest.length === 1 && !pair ? "1fr" : "repeat(auto-fill, minmax(140px, 1fr))", gap: 6, marginTop: 6 }}>
            {rest.map((p) => <Photo key={p.id} href={src(p.id)} />)}
          </div>
        )}

        {report.summary.trim() && (
          <section style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>What we did</h2>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.55, color: "#1f2937" }}>{report.summary}</p>
          </section>
        )}

        {report.records.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Keep for your records</h2>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "4px 12px" }}>
              {report.records.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: i ? "1px solid #f3f4f6" : "none", fontSize: 14 }}>
                  {r.label && <span style={{ color: "#4b5563" }}>{r.label}</span>}
                  <strong style={{ textAlign: r.label ? "right" : "left" }}>{r.detail}</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        <Link href="/portal/login" style={{ display: "block", textAlign: "center", marginTop: 24, background: "#1d4ed8", color: "#fff", borderRadius: 12, padding: 13, fontWeight: 700, textDecoration: "none" }}>
          See all your work with us
        </Link>
        <a href={`sms:${BUSINESS_PHONE_E164}`} style={{ display: "block", textAlign: "center", marginTop: 8, border: "1px solid #e5e7eb", color: "#1d4ed8", borderRadius: 12, padding: 12, fontWeight: 700, textDecoration: "none" }}>
          Questions? Text us at {BUSINESS_PHONE_DISPLAY}
        </a>
      </div>
    </main>
  );
}

function Photo({ href, label }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ position: "relative", display: "block", aspectRatio: "4 / 3", borderRadius: 10, overflow: "hidden", background: "#e5e7eb" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={href} alt={label ?? "Job photo"} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {label && (
        <span style={{ position: "absolute", left: 6, bottom: 6, background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 11, padding: "2px 6px", borderRadius: 6 }}>{label}</span>
      )}
    </a>
  );
}
