import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { PageContainer, PageHeader, Card, EmptyState, StatusBadge, LinkButton } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending:    "Pending",
  needs_info: "Needs Info",
  duplicate:  "Duplicate",
  reviewed:   "Reviewed",
  converted:  "Converted",
  cancelled:  "Cancelled",
};

const STATUS_ORDER = ["pending", "needs_info", "reviewed", "duplicate", "converted", "cancelled"];

const CATEGORY_LABELS: Record<string, string> = {
  general_repairs:        "General Repairs",
  plumbing:               "Plumbing",
  electrical:             "Electrical",
  carpentry_furniture:    "Carpentry / Furniture",
  painting_finishes:      "Painting & Finishes",
  outdoor_seasonal:       "Outdoor / Seasonal",
  mounting_installs:      "Mounting & Installs",
  maintenance_small:      "Small Maintenance",
  specialty_expansion:    "Specialty / Expansion",
};

type BookingRow = {
  id: string;
  status: string;
  name: string;
  email: string | null;
  phone: string | null;
  service_category: string;
  preferred_date: string;
  preferred_time_slot: string | null;
  address: string;
  city: string | null;
  created_at: string;
  reviewed_by_name: string | null;
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function BookingRequestsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");

  const { status: statusFilter } = await searchParams;
  const validStatus = STATUS_ORDER.includes(statusFilter ?? "") ? statusFilter : null;

  const conditions = ["br.account_id = $1"];
  const params: unknown[] = [session.accountId];
  if (validStatus) {
    conditions.push(`br.status = $2`);
    params.push(validStatus);
  }

  const rows = await query<BookingRow>(
    `SELECT br.id, br.status, br.name, br.email, br.phone,
            br.service_category, br.preferred_date, br.preferred_time_slot,
            br.address, br.city, br.created_at,
            u.full_name AS reviewed_by_name
     FROM booking_requests br
     LEFT JOIN users u ON u.id = br.reviewed_by
     WHERE ${conditions.join(" AND ")}
     ORDER BY br.created_at DESC
     LIMIT 100`,
    params
  );

  // Status tab counts
  const counts = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
     FROM booking_requests WHERE account_id = $1
     GROUP BY status`,
    [session.accountId]
  );
  const countMap: Record<string, number> = {};
  for (const r of counts) countMap[r.status] = parseInt(r.count, 10);

  return (
    <PageContainer>
      <PageHeader
        title="Requests"
        subtitle={`${rows.length} request${rows.length !== 1 ? "s" : ""}${validStatus ? ` · ${STATUS_LABELS[validStatus]}` : ""}`}
        actions={<LinkButton href="/app/intake/new">New Request</LinkButton>}
      />

      {/* Status filter tabs */}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        <Link
          href={"/app/booking-requests" as Route}
          style={{
            padding: "4px 12px",
            borderRadius: "var(--radius-full)",
            fontSize: "var(--text-sm)",
            fontWeight: !validStatus ? 600 : 400,
            background: !validStatus ? "var(--accent)" : "var(--bg-subtle)",
            color: !validStatus ? "#fff" : "var(--fg)",
            textDecoration: "none",
          }}
        >
          All ({Object.values(countMap).reduce((s, n) => s + n, 0)})
        </Link>
        {STATUS_ORDER.map((s) => (
          <Link
            key={s}
            href={`/app/booking-requests?status=${s}` as Route}
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-sm)",
              fontWeight: validStatus === s ? 600 : 400,
              background: validStatus === s ? "var(--accent)" : "var(--bg-subtle)",
              color: validStatus === s ? "#fff" : "var(--fg)",
              textDecoration: "none",
            }}
          >
            {STATUS_LABELS[s]}{countMap[s] ? ` (${countMap[s]})` : ""}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No booking requests"
          description={validStatus ? `No ${STATUS_LABELS[validStatus].toLowerCase()} requests.` : "Requests submitted through the booking form will appear here."}
        />
      ) : (
        <Card>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600, color: "var(--fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Received</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600, color: "var(--fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600, color: "var(--fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Service</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600, color: "var(--fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Preferred Date</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600, color: "var(--fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Location</th>
                  <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600, color: "var(--fg-muted)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: idx < rows.length - 1 ? "1px solid var(--border)" : "none" }}
                  >
                    <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                      {new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      <Link href={`/app/booking-requests/${row.id}` as Route} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
                        {row.name}
                      </Link>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {row.email ?? row.phone ?? "—"}
                      </div>
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      {CATEGORY_LABELS[row.service_category] ?? row.service_category}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", whiteSpace: "nowrap" }}>
                      {new Date(row.preferred_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {row.preferred_time_slot && (
                        <span style={{ marginLeft: 4, color: "var(--fg-muted)", textTransform: "capitalize" }}>· {row.preferred_time_slot}</span>
                      )}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      {row.address}{row.city ? `, ${row.city}` : ""}
                    </td>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                      <StatusBadge variant={row.status as StatusVariant}>{STATUS_LABELS[row.status] ?? row.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
