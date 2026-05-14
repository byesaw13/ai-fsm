import Link from "next/link";
import type { Route } from "next";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
import {
  Card,
  LinkButton,
  PageContainer,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { computeRenewalStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

interface MaintenancePlanRow {
  id: string;
  client_id: string;
  property_id: string | null;
  name: string;
  membership_tier: string;
  frequency: string;
  services: string[];
  price_cents: number;
  annual_visit_count: number;
  included_labor_minutes_per_visit: number;
  annual_price_cents: number;
  renewal_date: string | null;
  member_priority: string;
  routing_zone: string;
  status: string;
  next_scheduled_date: string | null;
  created_at: string;
  client_name: string;
  property_address: string | null;
  [key: string]: unknown;
}

export default async function MaintenancePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const session = await getSession();
  if (!session) return null;
  if (!canManageClients(session.role)) return null;

  const statusFilter = status || "all";

  let sql = `
    SELECT mp.*, c.name AS client_name, p.address AS property_address
    FROM maintenance_plans mp
    JOIN clients c ON c.id = mp.client_id
    LEFT JOIN properties p ON p.id = mp.property_id
    WHERE mp.account_id = $1
  `;
  const params: unknown[] = [session.accountId];

  if (statusFilter !== "all") {
    sql += ` AND mp.status = $2`;
    params.push(statusFilter);
  }

  sql += ` ORDER BY mp.status, c.name`;

  const rows = await query<MaintenancePlanRow>(sql, params);

  const frequencyLabels: Record<string, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    biannual: "Bi-annual",
    annual: "Annual",
  };

  const tierLabels: Record<string, string> = {
    essential: "Essential",
    plus: "Plus",
    premier: "Premier",
  };

  const zoneLabels: Record<string, string> = {
    core: "Core Zone",
    extended: "Extended Zone",
    out_of_area: "Out of Area",
  };

  const statusVariant: Record<string, StatusVariant> = {
    active: "completed",
    paused: "in_progress",
    cancelled: "cancelled",
  };

  return (
    <PageContainer>
      <PageHeader
        title="Memberships"
        subtitle="Active client memberships"
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <LinkButton href="/app/maintenance-plans/templates" variant="ghost" size="sm">
              Membership Templates
            </LinkButton>
            <LinkButton href="/app/maintenance-plans/addons" variant="ghost" size="sm">
              Membership Add-ons
            </LinkButton>
            <LinkButton href="/app/maintenance-plans/new" variant="primary" size="sm">
              + Enroll Client
            </LinkButton>
          </div>
        }
      />

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
        {[
          { key: "all", label: "All" },
          { key: "active", label: "Active" },
          { key: "paused", label: "Paused" },
        ].map((tab) => {
          const isActive = statusFilter === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/app/maintenance-plans?status=${tab.key}` as unknown as Route}
              style={{
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-sm)",
                fontWeight: isActive ? "var(--font-semibold)" : "var(--font-medium)",
                background: isActive ? "var(--accent)" : "var(--bg-muted)",
                color: isActive ? "var(--accent-fg)" : "var(--fg-muted)",
                textDecoration: "none",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Plans list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {rows.map((plan) => (
          <Link
            key={plan.id}
            href={`/app/maintenance-plans/${plan.id}` as unknown as Route}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Card hover padding="default">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-3)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-base)" }}>{plan.name}</span>
                    <StatusBadge variant={plan.status as StatusVariant}>
                      {plan.status}
                    </StatusBadge>
                    {plan.member_priority === "vip" && (
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", padding: "1px 6px", borderRadius: "var(--radius-sm)", background: "#fef3c7", color: "#92400e" }}>VIP</span>
                    )}
                    {plan.member_priority === "priority" && (
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", padding: "1px 6px", borderRadius: "var(--radius-sm)", background: "#dbeafe", color: "#1e40af" }}>Priority</span>
                    )}
                    {(() => {
                      const rs = computeRenewalStatus(plan.renewal_date);
                      if (rs === "approaching") return <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", padding: "1px 6px", borderRadius: "var(--radius-sm)", background: "#fef3c7", color: "#92400e" }}>Renewal Soon</span>;
                      if (rs === "expired") return <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", padding: "1px 6px", borderRadius: "var(--radius-sm)", background: "#fee2e2", color: "#991b1b" }}>Renewal Overdue</span>;
                      return null;
                    })()}
                  </div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    {plan.client_name}
                    {plan.property_address && <> &middot; {plan.property_address}</>}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "var(--space-1)" }}>
                    {tierLabels[plan.membership_tier] || "Plus"}
                    {" · "}
                    {plan.annual_visit_count || 2} visit{(plan.annual_visit_count || 2) === 1 ? "" : "s"}/yr
                    {" · "}
                    {plan.included_labor_minutes_per_visit || 60} min cap
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "var(--space-1)" }}>
                    {frequencyLabels[plan.frequency] || plan.frequency}
                    {" · "}
                    {zoneLabels[plan.routing_zone] || "Core Zone"}
                    {plan.next_scheduled_date && (
                      <> &middot; Next: {new Date(plan.next_scheduled_date).toLocaleDateString()}</>
                    )}
                    {plan.renewal_date && (
                      <> &middot; Renewal: {new Date(plan.renewal_date).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-lg)", color: "var(--fg)", flexShrink: 0 }}>
                  ${((plan.annual_price_cents || plan.price_cents * (plan.annual_visit_count || 1)) / 100).toFixed(2)}
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: "var(--font-medium)", textAlign: "right" }}>
                    annual
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}

        {rows.length === 0 && (
            <Card padding="default" style={{ textAlign: "center", color: "var(--fg-muted)" }}>
            <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>No memberships found.</p>
              <LinkButton href="/app/maintenance-plans/new" variant="primary" size="default" style={{ marginTop: "var(--space-3)" }}>
              Create your first plan
            </LinkButton>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
