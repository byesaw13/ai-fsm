import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { Card, EmptyState, LinkButton, PageContainer, PageHeader, StatusBadge } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { PRICING_MODE_LABELS } from "@ai-fsm/domain";
import { getRequestGuidance } from "./request-guidance";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  needs_info: "Needs Info",
  duplicate: "Duplicate",
  reviewed: "Reviewed",
  converted: "Converted",
  cancelled: "Cancelled",
};

const STATUS_ORDER = ["pending", "needs_info", "reviewed", "duplicate", "converted", "cancelled"];

const CATEGORY_LABELS: Record<string, string> = {
  general_repairs: "General Repairs",
  plumbing: "Plumbing",
  electrical: "Electrical",
  carpentry_furniture: "Carpentry / Furniture",
  painting_finishes: "Painting & Finishes",
  outdoor_seasonal: "Outdoor / Seasonal",
  mounting_installs: "Mounting & Installs",
  maintenance_small: "Small Maintenance",
  specialty_expansion: "Specialty / Expansion",
};

type PricingMode = "flat_rate" | "hourly_internal";

type RequestRow = {
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
  created_at: string;
  client_id: string | null;
  job_id: string | null;
  visit_id: string | null;
  pricing_mode: PricingMode | null;
  routing_path: string | null;
  walkthrough_score: number | null;
  referral_source: string | null;
  referral_name: string | null;
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pricingPathLabel(mode: PricingMode | null): string {
  if (!mode) return "Needs Review";
  return PRICING_MODE_LABELS[mode] ?? mode;
}

function getAction(row: RequestRow): { label: string; href: string; detail: string } {
  const guidance = getRequestGuidance({
    status: row.status,
    pricing_mode: row.pricing_mode,
    routing_path: row.routing_path as "site_visit" | "remote_estimate" | "book_work" | "pending" | null,
    job_id: row.job_id,
    visit_id: row.visit_id,
    walkthrough_score: row.walkthrough_score,
    service_category: row.service_category,
  });

  if (guidance.followUpKind && guidance.followUpHref) {
    return {
      label: guidance.followUpKind === "view_visit" ? "Open Visit" : "Open Project",
      href: guidance.followUpHref,
      detail: guidance.recommendedDetail,
    };
  }

  switch (guidance.primaryActionKind) {
    case "create_estimate":
      return {
        label: "Create Estimate",
        href: row.client_id ? `/app/estimates/new?client_id=${row.client_id}&pricing_mode=flat_rate` : "/app/estimates/new",
        detail: guidance.recommendedDetail,
      };
    case "create_job":
      return {
        label: "Open Request",
        href: `/app/requests/${row.id}`,
        detail: guidance.recommendedDetail,
      };
    case "schedule_assessment":
      return {
        label: "Schedule Assessment",
        href: `/app/requests/${row.id}`,
        detail: guidance.recommendedDetail,
      };
    case "schedule_work":
      return {
        label: "Schedule Work Day",
        href: row.job_id
          ? `/app/jobs/${row.job_id}/visits/new?visit_type=standard&intent=book_work`
          : `/app/requests/${row.id}`,
        detail: guidance.recommendedDetail,
      };
    case "choose_path":
      return {
        label: "Choose path",
        href: `/app/requests/${row.id}`,
        detail: guidance.recommendedDetail,
      };
    case "close_request":
    default:
      return {
        label: "Open Request",
        href: `/app/requests/${row.id}`,
        detail: guidance.recommendedDetail,
      };
  }
}

export default async function RequestsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");

  const { status: statusFilter } = await searchParams;
  const validStatus = STATUS_ORDER.includes(statusFilter ?? "") ? statusFilter : null;

  const conditions = ["br.account_id = $1"];
  const params: unknown[] = [session.accountId];
  if (validStatus) {
    conditions.push(`br.status = $${params.length + 1}`);
    params.push(validStatus);
  }

  const rows = await query<RequestRow>(
    `SELECT br.id, br.status, br.name, br.email, br.phone,
            br.service_category, br.service_description,
            br.preferred_date, br.preferred_time_slot,
            br.address, br.city, br.created_at,
            br.client_id, br.job_id, br.visit_id, br.pricing_mode, br.routing_path,
            br.walkthrough_score,
            br.referral_source, br.referral_name
     FROM booking_requests br
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE br.status
         WHEN 'pending' THEN 0
         WHEN 'needs_info' THEN 1
         WHEN 'reviewed' THEN 2
         WHEN 'duplicate' THEN 3
         WHEN 'converted' THEN 4
         WHEN 'cancelled' THEN 5
         ELSE 6
       END,
       br.created_at DESC
     LIMIT 100`,
    params
  );

  const counts = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
     FROM booking_requests
     WHERE account_id = $1
     GROUP BY status`,
    [session.accountId]
  );
  const countMap: Record<string, number> = {};
  for (const r of counts) countMap[r.status] = parseInt(r.count, 10);
  const totalCount = Object.values(countMap).reduce((sum, count) => sum + count, 0);

  return (
    <PageContainer>
      <PageHeader
        title="Requests"
        subtitle="One front door for new work, walkthroughs, and estimate decisions."
        actions={<LinkButton href="/app/intake/new">New Request</LinkButton>}
      />

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        <Link
          href={"/app/requests" as Route}
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
          All ({totalCount})
        </Link>
        {STATUS_ORDER.map((status) => (
          <Link
            key={status}
            href={`/app/requests?status=${status}` as Route}
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--text-sm)",
              fontWeight: validStatus === status ? 600 : 400,
              background: validStatus === status ? "var(--accent)" : "var(--bg-subtle)",
              color: validStatus === status ? "#fff" : "var(--fg)",
              textDecoration: "none",
            }}
          >
            {STATUS_LABELS[status]}{countMap[status] ? ` (${countMap[status]})` : ""}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No requests"
          description={validStatus ? `No ${STATUS_LABELS[validStatus].toLowerCase()} requests.` : "New requests from the booking form, calls, and quick capture will appear here."}
        />
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {rows.map((row) => {
            const action = getAction(row);
            const contact = row.email ?? row.phone ?? "No contact saved";
            const source = row.referral_source === "realtor" && row.referral_name
              ? `Realtor: ${row.referral_name}`
              : row.referral_source
                ? row.referral_source.replaceAll("_", " ")
                : "Direct request";

            return (
              <Card key={row.id}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)", alignItems: "start" }}>
                  <div>
                    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--space-1)" }}>
                      <Link href={`/app/requests/${row.id}` as Route} style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>
                        {row.name}
                      </Link>
                      <StatusBadge variant={row.status as StatusVariant}>{STATUS_LABELS[row.status] ?? row.status}</StatusBadge>
                    </div>
                    <p style={{ margin: "0 0 var(--space-1)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                      {contact} · {source}
                    </p>
                    <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg)" }}>
                      {CATEGORY_LABELS[row.service_category] ?? row.service_category}: {row.service_description}
                    </p>
                    <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                      {row.address}{row.city ? `, ${row.city}` : ""} · Requested {formatDate(row.created_at)}
                    </p>
                  </div>

                  <div>
                    <p style={{ margin: "0 0 4px", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Request Type
                    </p>
                    <p style={{ margin: "0 0 var(--space-1)", fontWeight: 700 }}>{pricingPathLabel(row.pricing_mode)}</p>
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                      Preferred {formatDate(row.preferred_date)}{row.preferred_time_slot ? ` · ${row.preferred_time_slot}` : ""}
                    </p>
                  </div>

                  <div>
                    <p style={{ margin: "0 0 4px", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Next Step
                    </p>
                    <LinkButton href={action.href} size="sm" variant="primary">
                      {action.label}
                    </LinkButton>
                    <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                      {action.detail}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
