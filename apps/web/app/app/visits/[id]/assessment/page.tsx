import Link from "next/link";
import type { Route } from "next";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryOneForSession, queryForSession } from "@/lib/db";
import { Card, LinkButton, PageContainer, PageHeader, SectionHeader } from "@/components/ui";
import { AssessmentForm } from "./AssessmentForm";
import type { Assessment } from "./AssessmentForm";
import { formatVisitDateLabel } from "@/lib/visits/formatting";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

type AssessmentRow = Assessment & Record<string, unknown>;

interface PhotoRow extends Record<string, unknown> {
  id: string;
  original_name: string;
  created_at: string;
}

function isAssessmentFormEmpty(a: AssessmentRow | null): boolean {
  if (!a) return true;
  const rooms = Array.isArray(a.rooms) ? a.rooms : [];
  const namedRoom = rooms.some(
    (r) => r && typeof r === "object" && String((r as { name?: string }).name ?? "").trim(),
  );
  const hasNotes =
    !!(a.scope_notes && String(a.scope_notes).trim()) ||
    !!(a.access_notes && String(a.access_notes).trim());
  return !namedRoom && !hasNotes && !a.total_sqft;
}

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const visit = await queryOneForSession<{
    id: string;
    visit_type: string | null;
    status: string;
    assigned_user_id: string | null;
    scheduled_start: string | Date;
    job_id: string | null;
    job_title: string | null;
    job_client_id: string | null;
    job_property_id: string | null;
    tech_notes: string | null;
    issue_description: string | null;
    job_description: string | null;
    [key: string]: unknown;
  }>(
    session,
    `SELECT v.id, v.visit_type, v.status, v.assigned_user_id, v.scheduled_start, v.job_id,
            v.tech_notes, v.issue_description,
            j.title AS job_title, j.client_id AS job_client_id, j.property_id AS job_property_id,
            j.description AS job_description
     FROM visits v
     LEFT JOIN jobs j ON j.id = v.job_id
     WHERE v.id = $1 AND v.account_id = $2`,
    [id, session.accountId]
  );

  if (!visit) notFound();

  if (visit.visit_type !== "site_visit") {
    redirect(`/app/visits/${id}`);
  }

  if (session.role === "tech" && visit.assigned_user_id !== session.userId) {
    notFound();
  }

  const assessment = await queryOneForSession<AssessmentRow>(
    session,
    `SELECT * FROM site_visit_assessments WHERE visit_id = $1 AND account_id = $2`,
    [id, session.accountId]
  );

  const photos = await queryForSession<PhotoRow>(
    session,
    `SELECT id, original_name, created_at FROM visit_media
     WHERE visit_id = $1 AND account_id = $2 AND category = 'assessment'
     ORDER BY created_at`,
    [id, session.accountId]
  );

  const estimates = visit.job_id
    ? await queryForSession<{
        id: string;
        status: string;
        estimate_number: string | null;
        total_cents: number;
        internal_notes: string | null;
      }>(
        session,
        `SELECT id, status, estimate_number, total_cents, internal_notes
         FROM estimates
         WHERE job_id = $1 AND account_id = $2
         ORDER BY
           CASE status WHEN 'approved' THEN 0 WHEN 'sent' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
           created_at DESC
         LIMIT 5`,
        [visit.job_id, session.accountId],
      )
    : [];

  const workOrders = visit.job_id
    ? await queryForSession<{
        id: string;
        title: string;
        status: string;
        scope: string | null;
        site_notes: string | null;
        notes: string | null;
      }>(
        session,
        `SELECT id, title, status, scope, site_notes, notes
         FROM work_orders
         WHERE job_id = $1 AND account_id = $2
           AND status NOT IN ('cancelled')
         ORDER BY created_at DESC
         LIMIT 5`,
        [visit.job_id, session.accountId],
      )
    : [];

  const canEdit =
    visit.status !== "cancelled" && visit.status !== "completed"
      ? true
      : session.role !== "tech";

  const toISO = (v: unknown): string =>
    v instanceof Date ? v.toISOString() : String(v ?? "");

  const formEmpty = isAssessmentFormEmpty(assessment);
  const jobDesc = (visit.job_description ?? "").trim();
  const issueDesc = (visit.issue_description ?? "").trim();
  const techNotes = (visit.tech_notes ?? "").trim();
  const hasContext =
    !!jobDesc ||
    !!issueDesc ||
    !!techNotes ||
    photos.length > 0 ||
    estimates.length > 0 ||
    workOrders.some((w) => (w.scope ?? "").trim() || (w.notes ?? "").trim());

  return (
    <PageContainer>
      <PageHeader
        title="Site Assessment"
        subtitle={`${formatVisitDateLabel(toISO(visit.scheduled_start))}${
          visit.job_title ? ` · ${visit.job_title}` : ""
        }`}
        backHref={visit.job_id ? `/app/jobs/${visit.job_id}` : `/app/visits/${id}`}
        backLabel={visit.job_title ?? "Visit"}
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <LinkButton href="/app/materials/quick" variant="secondary" size="sm">
              📦 Quick Buy List
            </LinkButton>
            {visit.job_id && (
              <LinkButton href={`/app/jobs/${visit.job_id}` as Route} variant="secondary" size="sm">
                Project
              </LinkButton>
            )}
          </div>
        }
      />

      {hasContext && (
        <Card data-testid="assessment-context" style={{ marginBottom: "var(--space-4)" }}>
          <SectionHeader title="Original assessment context" />
          <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            What was captured for this site visit and the project it fed. Use this as a refresher —
            the structured form below may be incomplete if scope was written on the project or estimate.
          </p>

          {formEmpty && (
            <div
              role="status"
              style={{
                marginBottom: "var(--space-3)",
                padding: "var(--space-3)",
                borderRadius: 8,
                border: "1px solid var(--color-amber-200, #fde68a)",
                background: "var(--color-amber-50, #fffbeb)",
                fontSize: "var(--text-sm)",
              }}
            >
              The structured room/scope form is empty or minimal. Primary notes are usually in{" "}
              <strong>project description</strong>, <strong>estimate</strong>, or{" "}
              <strong>work order scope</strong> below.
            </div>
          )}

          {jobDesc ? (
            <div style={{ marginBottom: "var(--space-4)" }}>
              <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 700 }}>
                Project scope / notes
              </h3>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "var(--text-sm)",
                  lineHeight: 1.5,
                  padding: "var(--space-3)",
                  background: "var(--bg)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                {jobDesc}
              </pre>
            </div>
          ) : null}

          {issueDesc ? (
            <div style={{ marginBottom: "var(--space-4)" }}>
              <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 700 }}>
                Issue description
              </h3>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "var(--text-sm)" }}>{issueDesc}</p>
            </div>
          ) : null}

          {techNotes ? (
            <div style={{ marginBottom: "var(--space-4)" }}>
              <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 700 }}>
                Field notes
              </h3>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "var(--text-sm)" }}>{techNotes}</p>
            </div>
          ) : null}

          {photos.length > 0 ? (
            <div style={{ marginBottom: "var(--space-4)" }}>
              <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 700 }}>
                Assessment photos ({photos.length})
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: "var(--space-2)",
                }}
              >
                {photos.map((p) => (
                  <a
                    key={p.id}
                    href={`/api/v1/visits/${id}/media/${p.id}/image`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "block", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}
                  >
                    {/* API image route — plain img avoids Next Image domain config */}
                    <img
                      src={`/api/v1/visits/${id}/media/${p.id}/image`}
                      alt={p.original_name || "Assessment photo"}
                      style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                    />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {estimates.length > 0 ? (
            <div style={{ marginBottom: "var(--space-4)" }}>
              <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 700 }}>
                Estimates from this work
              </h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {estimates.map((e) => (
                  <li key={e.id} style={{ marginBottom: "var(--space-2)" }}>
                    <Link
                      href={`/app/estimates/${e.id}` as Route}
                      style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
                    >
                      {e.estimate_number ?? "Estimate"} · {e.status} · {formatCents(e.total_cents)} →
                    </Link>
                    {e.internal_notes ? (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: "var(--text-xs)",
                          color: "var(--fg-muted)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {e.internal_notes.slice(0, 280)}
                        {e.internal_notes.length > 280 ? "…" : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {workOrders.some((w) => (w.scope ?? "").trim()) ? (
            <div>
              <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 700 }}>
                Work order scope
              </h3>
              {workOrders
                .filter((w) => (w.scope ?? "").trim())
                .map((w) => (
                  <div key={w.id} style={{ marginBottom: "var(--space-3)" }}>
                    <Link
                      href={`/app/work-orders/${w.id}` as Route}
                      style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none", fontSize: "var(--text-sm)" }}
                    >
                      {w.title} →
                    </Link>
                    <pre
                      style={{
                        margin: "6px 0 0",
                        whiteSpace: "pre-wrap",
                        fontFamily: "inherit",
                        fontSize: "var(--text-sm)",
                        lineHeight: 1.45,
                        maxHeight: 200,
                        overflow: "auto",
                        padding: "var(--space-2)",
                        background: "var(--bg)",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                      }}
                    >
                      {(w.scope ?? "").slice(0, 1200)}
                      {(w.scope ?? "").length > 1200 ? "…" : ""}
                    </pre>
                  </div>
                ))}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
            <LinkButton href={`/app/visits/${id}` as Route} variant="secondary" size="sm">
              Open visit record
            </LinkButton>
            {visit.job_id ? (
              <LinkButton href={`/app/jobs/${visit.job_id}` as Route} variant="ghost" size="sm">
                Back to project
              </LinkButton>
            ) : null}
          </div>
        </Card>
      )}

      <Card>
        <SectionHeader title="Structured assessment form" />
        <AssessmentForm
          visitId={id}
          jobId={visit.job_id}
          jobTitle={visit.job_title}
          clientId={visit.job_client_id}
          propertyId={visit.job_property_id}
          initialAssessment={assessment}
          initialPhotos={photos}
          canEdit={canEdit}
        />
      </Card>
    </PageContainer>
  );
}
