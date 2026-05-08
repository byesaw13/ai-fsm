import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  Badge,
  Card,
  EmptyState,
  ItemCard,
  LinkButton,
  PageContainer,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import { BookingRequestActions } from "./BookingRequestActions";

export const dynamic = "force-dynamic";

type BookingRequestStatus = "pending" | "reviewed" | "converted" | "cancelled";

type BookingRequestRow = {
  id: string;
  status: BookingRequestStatus;
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
  job_id: string | null;
  visit_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  job_title: string | null;
};

const STATUS_LABELS: Record<BookingRequestStatus, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  converted: "Converted",
  cancelled: "Cancelled",
};

const SERVICE_LABELS: Record<string, string> = {
  general_repairs: "General Repairs",
  plumbing: "Plumbing",
  electrical: "Electrical",
  carpentry_furniture: "Carpentry & Furniture",
  painting_finishes: "Painting & Finishes",
  outdoor_seasonal: "Outdoor & Seasonal",
  mounting_installs: "Mounting & Installs",
  maintenance_small: "Maintenance & Small Jobs",
  specialty_expansion: "Specialty Projects",
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function BookingRequestsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");

  const { status } = await searchParams;
  const statusFilter = isBookingStatus(status) ? status : "pending";

  const requests = await query<BookingRequestRow>(
    `SELECT br.id, br.status, br.name, br.email, br.phone, br.service_category,
            br.service_description, br.preferred_date::text, br.preferred_time_slot,
            br.address, br.city, br.state, br.zip, br.access_notes,
            br.job_id, br.visit_id, br.created_at::text, br.reviewed_at::text,
            u.full_name AS reviewed_by_name,
            j.title AS job_title
     FROM booking_requests br
     LEFT JOIN users u ON u.id = br.reviewed_by
     LEFT JOIN jobs j ON j.id = br.job_id
     WHERE br.account_id = $1 AND br.status = $2
     ORDER BY br.created_at DESC
     LIMIT 100`,
    [session.accountId, statusFilter]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Booking Requests"
        subtitle={`${requests.length} ${STATUS_LABELS[statusFilter].toLowerCase()} request${requests.length !== 1 ? "s" : ""}`}
        actions={<LinkButton href="/booking" variant="secondary">Public Form</LinkButton>}
      />

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        {(["pending", "reviewed", "converted", "cancelled"] as BookingRequestStatus[]).map((s) => (
          <LinkButton
            key={s}
            href={`/app/booking-requests?status=${s}`}
            variant={statusFilter === s ? "primary" : "ghost"}
            size="sm"
          >
            {STATUS_LABELS[s]}
          </LinkButton>
        ))}
      </div>

      {requests.length === 0 ? (
        <EmptyState
          title={`No ${STATUS_LABELS[statusFilter].toLowerCase()} booking requests`}
          description={
            statusFilter === "pending"
              ? "New public service requests will appear here for review before scheduling."
              : "Try another status filter."
          }
          data-testid="booking-requests-empty"
        />
      ) : (
        <Card>
          <SectionHeader title={STATUS_LABELS[statusFilter]} count={requests.length} />
          <div style={{ marginTop: "var(--space-3)" }}>
            {requests.map((request) => (
              <BookingRequestCard key={request.id} request={request} />
            ))}
          </div>
        </Card>
      )}
    </PageContainer>
  );
}

function BookingRequestCard({ request }: { request: BookingRequestRow }) {
  const serviceLabel = SERVICE_LABELS[request.service_category] ?? request.service_category;
  const contact = [request.phone, request.email].filter(Boolean).join(" / ");
  const location = [request.address, request.city, request.state, request.zip]
    .filter(Boolean)
    .join(", ");
  const preferred = formatPreferredWindow(request.preferred_date, request.preferred_time_slot);

  return (
    <ItemCard
      title={`${request.name} - ${serviceLabel}`}
      titleBadge={<Badge>{STATUS_LABELS[request.status]}</Badge>}
      meta={
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {contact && <span>{contact}</span>}
            <span>{preferred}</span>
            {request.job_id && (
              <Link href={`/app/jobs/${request.job_id}`}>
                {request.job_title ?? "Draft job"}
              </Link>
            )}
          </div>
          <span>{location}</span>
          <span style={{ color: "var(--fg)" }}>{request.service_description}</span>
          {request.access_notes && <span>Access: {request.access_notes}</span>}
          {request.reviewed_at && (
            <span>
              Reviewed {new Date(request.reviewed_at).toLocaleDateString()}
              {request.reviewed_by_name ? ` by ${request.reviewed_by_name}` : ""}
            </span>
          )}
        </div>
      }
      actions={
        <BookingRequestActions
          requestId={request.id}
          status={request.status}
          jobId={request.job_id}
        />
      }
      data-testid="booking-request-card"
    />
  );
}

function isBookingStatus(value: string | undefined): value is BookingRequestStatus {
  return value === "pending" || value === "reviewed" || value === "converted" || value === "cancelled";
}

function formatPreferredWindow(date: string, slot: string | null): string {
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (!slot) return dateLabel;
  const slotLabel = slot === "morning" ? "morning" : slot === "afternoon" ? "afternoon" : "evening";
  return `${dateLabel}, ${slotLabel}`;
}
