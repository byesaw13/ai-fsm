import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import { PageContainer, PageHeader, Card, SectionHeader, StatusBadge, LinkButton } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { ReviewActions } from "./ReviewActions";

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

  const received = new Date(br.created_at).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const preferredDate = new Date(br.preferred_date).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <PageContainer>
      <PageHeader
        title={`Booking — ${br.name}`}
        subtitle={received}
        backHref="/app/booking-requests"
        actions={
          <StatusBadge variant={br.status as StatusVariant}>
            {STATUS_LABELS[br.status] ?? br.status}
          </StatusBadge>
        }
      />

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
              jobId={br.job_id}
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
