import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import { PageContainer, PageHeader, Card, SectionHeader, StatusBadge, LinkButton } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { ReviewActions } from "./ReviewActions";
import { IntakeSummary } from "./IntakeSummary";
import { INTAKE_QUESTIONS, INTAKE_METADATA_LABELS } from "@/lib/intake/questions";
import { PRICING_MODE_LABELS, scoreJobFit } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending:    "Pending",
  needs_info: "Needs Info",
  duplicate:  "Duplicate",
  reviewed:   "Reviewed",
  converted:  "Converted",
  cancelled:  "Cancelled",
};

const CATEGORY_LABELS: Record<string, string> = {
  general_repairs:     "General Repairs",
  plumbing:            "Plumbing",
  electrical:          "Electrical",
  carpentry_furniture: "Carpentry / Furniture",
  painting_finishes:   "Painting & Finishes",
  outdoor_seasonal:    "Outdoor / Seasonal",
  mounting_installs:   "Mounting & Installs",
  maintenance_small:   "Small Maintenance",
  specialty_expansion: "Specialty / Expansion",
};

const CONTACT_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  phone: "Phone",
};

const REFERRAL_LABELS: Record<string, string> = {
  online: "Found us online",
  friend_neighbor: "Friend or neighbor",
  realtor: "Realtor referral",
  repeat: "Previous client",
  other: "Other",
};

type BookingRow = {
  id: string;
  status: string;
  name: string;
  email: string | null;
  phone: string | null;
  service_category: string;
  service_description: string;
  preferred_date: string;
  preferred_time_slot: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  access_notes: string | null;
  preferred_contact: string;
  sms_consent: boolean;
  sms_consent_at: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  created_at: string;
  job_id: string | null;
  job_title: string | null;
  job_status: string | null;
  visit_id: string | null;
  client_id: string | null;
  duplicate_candidate_ids: string[] | null;
  routing_path: string | null;
  pricing_mode: string | null;
  walkthrough_score: number | null;
  referral_source: string | null;
  referral_name: string | null;
  intake_metadata: Record<string, string> | null;
};

type DuplicateBookingRow = {
  id: string;
  name: string;
  created_at: string;
  status: string;
};

export default async function BookingRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");

  const br = await queryOne<BookingRow>(
    `SELECT br.*, u.full_name AS reviewed_by_name,
            j.title AS job_title, j.status AS job_status
     FROM booking_requests br
     LEFT JOIN users u ON u.id = br.reviewed_by
     LEFT JOIN jobs j ON j.id = br.job_id
     WHERE br.id = $1 AND br.account_id = $2`,
    [id, session.accountId]
  );

  if (!br) notFound();

  const duplicateIds = br.duplicate_candidate_ids ?? [];
  const duplicateRows = duplicateIds.length > 0
    ? await query<DuplicateBookingRow>(
      `SELECT id, name, created_at, status
       FROM booking_requests
       WHERE account_id = $1 AND id = ANY($2::uuid[])
       ORDER BY created_at DESC`,
      [session.accountId, duplicateIds]
    )
    : [];

  const jobFit = scoreJobFit({
    service_category: br.service_category,
    referral_source: br.referral_source,
    intake_metadata: br.intake_metadata,
    walkthrough_score: br.walkthrough_score,
  });

  // Load latest invite to determine next-step banner state
  const inviteRows = await query<{ token: string; used_at: string | null; expires_at: string; created_at: string }>(
    `SELECT token::text, used_at, expires_at, created_at
     FROM intake_invites
     WHERE booking_request_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [id]
  );
  const latestInvite = inviteRows[0] ?? null;

  const received = new Date(br.created_at).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const preferredDate = new Date(br.preferred_date).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const requestNextStep = (() => {
    if (latestInvite?.used_at) {
      return {
        title: "Intake complete",
        detail: "Client filled out the intake form. Review the answers and move the request forward.",
        primaryLabel: "Review answers →",
        primaryHref: "#review-actions",
        secondaryLabel: br.job_id ? "Open Job →" : null,
        secondaryHref: br.job_id ? `/app/jobs/${br.job_id}` : null,
      };
    }

    if (latestInvite && !latestInvite.used_at && new Date(latestInvite.expires_at) > new Date()) {
      return {
        title: "Waiting on client",
        detail: "The intake form has been sent. Follow up if the client hasn't completed it yet.",
        primaryLabel: "Open review controls →",
        primaryHref: "#review-actions",
        secondaryLabel: null,
        secondaryHref: null,
      };
    }

    if (!br.pricing_mode && !["converted", "cancelled"].includes(br.status)) {
      return {
        title: "Choose the pricing path",
        detail: "Set Fixed Bid for estimated project work or Time and Materials for open-ended actuals.",
        primaryLabel: "Open review controls →",
        primaryHref: "#review-actions",
        secondaryLabel: null,
        secondaryHref: null,
      };
    }

    if (br.pricing_mode === "hourly_internal" && !br.job_id && !["converted", "cancelled"].includes(br.status)) {
      return {
        title: "Time and Materials path",
        detail: "Create the job thread first so labor and materials can be tracked from actuals.",
        primaryLabel: "Open review controls →",
        primaryHref: "#review-actions",
        secondaryLabel: null,
        secondaryHref: null,
      };
    }

    if (br.routing_path === "remote_estimate" && !br.job_id) {
      return {
        title: "Fixed bid path",
        detail: "Draft the estimate for this client.",
        primaryLabel: "Start estimate →",
        primaryHref: `/app/estimates/new${br.client_id ? `?client_id=${br.client_id}&pricing_mode=flat_rate` : "?pricing_mode=flat_rate"}`,
        secondaryLabel: "Open review controls →",
        secondaryHref: "#review-actions",
      };
    }

    if (br.routing_path === "site_visit" && !br.visit_id) {
      return {
        title: "Walkthrough recommended",
        detail: "Schedule a visit to measure and assess the job.",
        primaryLabel: br.job_id ? "Open Job →" : "Open review controls →",
        primaryHref: br.job_id ? `/app/jobs/${br.job_id}` : "#review-actions",
        secondaryLabel: null,
        secondaryHref: null,
      };
    }

    if (br.visit_id) {
      return {
        title: "Walkthrough scheduled",
        detail: "Open the scheduled visit and continue the job from there.",
        primaryLabel: "Open walkthrough →",
        primaryHref: `/app/visits/${br.visit_id}`,
        secondaryLabel: br.job_id ? "Open Job →" : null,
        secondaryHref: br.job_id ? `/app/jobs/${br.job_id}` : null,
      };
    }

    if (br.job_id) {
      return {
        title: "Request converted",
        detail: "Open the linked job to continue scheduling, estimating, or billing.",
        primaryLabel: "Open Job →",
        primaryHref: `/app/jobs/${br.job_id}`,
        secondaryLabel: null,
        secondaryHref: null,
      };
    }

    return null;
  })();

  return (
    <PageContainer>
      <PageHeader
        title={`Request — ${br.name}`}
        subtitle={received}
        backHref="/app/booking-requests"
        actions={
          <StatusBadge variant={br.status as StatusVariant}>
            {STATUS_LABELS[br.status] ?? br.status}
          </StatusBadge>
        }
      />

      {requestNextStep && (
        <Card style={{ marginBottom: "var(--space-3)" }}>
          <SectionHeader title="Next Step" />
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ minWidth: 240, flex: "1 1 320px" }}>
              <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{requestNextStep.title}</div>
              <div style={{ marginTop: "var(--space-1)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>{requestNextStep.detail}</div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
              <LinkButton href={requestNextStep.primaryHref as Route} variant="primary" size="sm">
                {requestNextStep.primaryLabel}
              </LinkButton>
              {requestNextStep.secondaryHref && requestNextStep.secondaryLabel && (
                <LinkButton href={requestNextStep.secondaryHref as Route} variant="secondary" size="sm">
                  {requestNextStep.secondaryLabel}
                </LinkButton>
              )}
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "var(--space-4)", alignItems: "start" }}>

        {/* Left — request details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {duplicateRows.length > 0 && (
            <div className="p7-alert p7-alert-warning" role="alert">
              <div>
                <p style={{ margin: "0 0 var(--space-2)", fontWeight: 600 }}>
                  Possible duplicate — {duplicateRows.length} similar request{duplicateRows.length === 1 ? "" : "s"} found in the last 90 days.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                  {duplicateRows.map((duplicate) => (
                    <Link
                      key={duplicate.id}
                      href={`/app/booking-requests/${duplicate.id}`}
                      style={{ color: "inherit", fontWeight: 600 }}
                    >
                      {duplicate.name} · {new Date(duplicate.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {STATUS_LABELS[duplicate.status] ?? duplicate.status}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Card>
            <SectionHeader title="Contact" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row"><dt>Name</dt><dd>{br.name}</dd></div>
              {br.email && <div className="p7-detail-row"><dt>Email</dt><dd><a href={`mailto:${br.email}`} style={{ color: "var(--accent)" }}>{br.email}</a></dd></div>}
              {br.phone && <div className="p7-detail-row"><dt>Phone</dt><dd><a href={`tel:${br.phone}`} style={{ color: "var(--accent)" }}>{br.phone}</a></dd></div>}
              {!br.email && !br.phone && <div className="p7-detail-row"><dt>Contact</dt><dd style={{ color: "var(--fg-muted)" }}>None provided</dd></div>}
            </dl>
          </Card>

          <Card>
            <SectionHeader title="Contact Preferences" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row">
                <dt>Preferred Method</dt>
                <dd>{CONTACT_LABELS[br.preferred_contact] ?? br.preferred_contact}</dd>
              </div>
              <div className="p7-detail-row">
                <dt>SMS Consent</dt>
                <dd>
                  {br.sms_consent ? "Granted" : "Not granted"}
                  {br.sms_consent_at && (
                    <span style={{ display: "block", color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 2 }}>
                      Recorded {new Date(br.sms_consent_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          {br.referral_source && (
            <Card>
              <SectionHeader title="Referral" />
              <dl className="p7-detail-list">
                <div className="p7-detail-row">
                  <dt>Source</dt>
                  <dd>{REFERRAL_LABELS[br.referral_source] ?? br.referral_source}</dd>
                </div>
                {br.referral_name && (
                  <div className="p7-detail-row">
                    <dt>Realtor</dt>
                    <dd>{br.referral_name}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          <Card>
            <SectionHeader title="Service Request" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row">
                <dt>Category</dt>
                <dd>{CATEGORY_LABELS[br.service_category] ?? br.service_category}</dd>
              </div>
              <div className="p7-detail-row">
                <dt>Description</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{br.service_description}</dd>
              </div>
              {br.intake_metadata && INTAKE_QUESTIONS[br.service_category]?.map((q) => {
                const val = br.intake_metadata?.[q.key];
                if (!val) return null;
                return (
                  <div key={q.key} className="p7-detail-row">
                    <dt>{q.label}</dt>
                    <dd>{INTAKE_METADATA_LABELS[q.key]?.[val] ?? val}</dd>
                  </div>
                );
              })}
              <div className="p7-detail-row">
                <dt>Pricing</dt>
                <dd>{br.pricing_mode ? PRICING_MODE_LABELS[br.pricing_mode as keyof typeof PRICING_MODE_LABELS] ?? br.pricing_mode : "Needs Review"}</dd>
              </div>
              {br.routing_path && br.routing_path !== "pending" && (
                <div className="p7-detail-row">
                  <dt>Routing</dt>
                  <dd>
                    {br.routing_path === "site_visit" ? "Site visit recommended" : "Remote estimate"}
                    {br.walkthrough_score != null && (
                      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginLeft: 6 }}>
                        (score {br.walkthrough_score})
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card>
            <SectionHeader title="Location & Schedule" />
            <dl className="p7-detail-list">
              <div className="p7-detail-row">
                <dt>Address</dt>
                <dd>
                  {br.address}
                  {(br.city || br.state || br.zip) && (
                    <span style={{ display: "block", color: "var(--fg-muted)" }}>
                      {[br.city, br.state, br.zip].filter(Boolean).join(", ")}
                    </span>
                  )}
                </dd>
              </div>
              <div className="p7-detail-row">
                <dt>Preferred Date</dt>
                <dd>
                  {preferredDate}
                  {br.preferred_time_slot && (
                    <span style={{ marginLeft: 8, color: "var(--fg-muted)", textTransform: "capitalize" }}>
                      · {br.preferred_time_slot}
                    </span>
                  )}
                </dd>
              </div>
              {br.access_notes && (
                <div className="p7-detail-row">
                  <dt>Access Notes</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{br.access_notes}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Linked records */}
          {(br.job_id || br.visit_id || br.client_id) && (
            <Card>
              <SectionHeader title="Linked Records" />
              <dl className="p7-detail-list">
                {br.job_id && (
                  <div className="p7-detail-row">
                    <dt>Job</dt>
                    <dd>
                      <Link href={`/app/jobs/${br.job_id}`} style={{ color: "var(--accent)" }}>
                        {br.job_title ?? br.job_id}
                      </Link>
                      {br.job_status && (
                        <span style={{ marginLeft: 8 }}>
                          <StatusBadge variant={br.job_status as StatusVariant}>{br.job_status}</StatusBadge>
                        </span>
                      )}
                    </dd>
                  </div>
                )}
                {br.visit_id && (
                  <div className="p7-detail-row">
                    <dt>Visit</dt>
                    <dd>
                      <Link href={`/app/visits/${br.visit_id}`} style={{ color: "var(--accent)" }}>
                        View Scheduled Visit →
                      </Link>
                    </dd>
                  </div>
                )}
                {br.client_id && (
                  <div className="p7-detail-row">
                    <dt>Client</dt>
                    <dd>
                      <Link href={`/app/clients/${br.client_id}`} style={{ color: "var(--accent)" }}>
                        View Client Record →
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          )}
        </div>

        {/* Right — review panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Card>
            <SectionHeader title="Job Fit" />
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                background: jobFit.score >= 80 ? "#dcfce7" : jobFit.score >= 60 ? "#dbeafe" : jobFit.score >= 40 ? "#fef9c3" : "#fee2e2",
                border: `2px solid ${jobFit.score >= 80 ? "#86efac" : jobFit.score >= 60 ? "#93c5fd" : jobFit.score >= 40 ? "#fde047" : "#fca5a5"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: "var(--text-sm)",
                color: jobFit.score >= 80 ? "#166534" : jobFit.score >= 60 ? "#1e40af" : jobFit.score >= 40 ? "#854d0e" : "#991b1b",
              }}>
                {jobFit.score}
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--text-sm)" }}>{jobFit.label}</p>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  {CATEGORY_LABELS[br.service_category] ?? br.service_category}
                </p>
              </div>
            </div>
            {jobFit.reasons.length > 0 && (
              <ul style={{ margin: 0, padding: "0 0 0 var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {jobFit.reasons.map((r) => (
                  <li key={r} style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{r}</li>
                ))}
              </ul>
            )}
          </Card>

          <IntakeSummary bookingId={br.id} />

          <Card id="review-actions">
            <SectionHeader title="Review" />
            {br.reviewed_at && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginBottom: "var(--space-3)" }}>
                Last updated {new Date(br.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {br.reviewed_by_name ? ` by ${br.reviewed_by_name}` : ""}
              </p>
            )}
            <ReviewActions
              bookingId={br.id}
              currentStatus={br.status}
              initialNotes={br.review_notes}
              initialPricingMode={(br.pricing_mode as "flat_rate" | "hourly_internal" | null) ?? null}
              jobId={br.job_id}
              clientEmail={br.email}
              preferredDate={br.preferred_date}
              preferredTimeSlot={br.preferred_time_slot}
            />
          </Card>

          {br.job_id && (
            <LinkButton href={`/app/jobs/${br.job_id}`} variant="secondary" style={{ width: "100%" }}>
              Open Job →
            </LinkButton>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
