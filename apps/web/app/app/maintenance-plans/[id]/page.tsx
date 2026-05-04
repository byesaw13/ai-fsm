import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
import {
  Card,
  LinkButton,
  PageContainer,
  PageHeader,
  StatusBadge,
  type StatusVariant,
} from "@/components/ui";

export const dynamic = "force-dynamic";

interface MaintenancePlan {
  id: string;
  account_id: string;
  client_id: string;
  property_id: string | null;
  name: string;
  membership_tier: string;
  frequency: string;
  services: string[];
  price_cents: number;
  annual_visit_count: number;
  included_labor_minutes_per_visit: number;
  billing_cadence: string;
  annual_price_cents: number;
  status: string;
  next_scheduled_date: string | null;
  renewal_date: string | null;
  routing_zone: string;
  notes: string | null;
  membership_terms: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client_name: string;
  property_address: string | null;
  [key: string]: unknown;
}

interface VisitRow {
  id: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: string;
  included_labor_cap_minutes: number | null;
  included_labor_minutes_used: number;
  membership_cap_status: string;
  job_title: string | null;
  [key: string]: unknown;
}

export default async function MaintenancePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const plan = await queryOne<MaintenancePlan>(
    `SELECT mp.*, c.name AS client_name, p.address AS property_address
     FROM maintenance_plans mp
     JOIN clients c ON c.id = mp.client_id
     LEFT JOIN properties p ON p.id = mp.property_id
     WHERE mp.id = $1 AND mp.account_id = $2`,
    [id, session.accountId]
  );

  if (!plan) notFound();

  // Get visits generated from this plan
  const visits = await query<VisitRow>(
    `SELECT v.id, v.scheduled_start, v.scheduled_end, v.status,
            v.included_labor_cap_minutes, v.included_labor_minutes_used,
            v.membership_cap_status, j.title AS job_title
     FROM visits v
     LEFT JOIN jobs j ON j.id = v.job_id
      WHERE v.generated_from_plan_id = $1 AND v.account_id = $2
      ORDER BY v.scheduled_start DESC
      LIMIT 20`,
    [id, session.accountId]
  );

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

  const billingLabels: Record<string, string> = {
    annual: "Annual",
    monthly: "Monthly",
  };

  const zoneLabels: Record<string, string> = {
    core: "Core Zone",
    extended: "Extended Zone",
    out_of_area: "Out of Area",
  };

  return (
    <PageContainer>
      <PageHeader
        title={plan.name}
        backHref="/app/maintenance-plans"
        backLabel="Plans"
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <LinkButton href={`/app/maintenance-plans/${id}/edit`} variant="secondary" size="sm">
              Edit
            </LinkButton>
          </div>
        }
      />

      {/* Status badge */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <StatusBadge variant={plan.status as StatusVariant}>
          {plan.status}
        </StatusBadge>
      </div>

      {/* Plan details */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        <Card padding="default">
          <h3 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--fg-muted)", textTransform: "uppercase" }}>
            Plan Details
          </h3>
          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div>
              <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Client</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>
                <Link href={`/app/clients/${plan.client_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                  {plan.client_name}
                </Link>
              </dd>
            </div>
            {plan.property_address && (
              <div>
                <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Property</dt>
                <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>{plan.property_address}</dd>
              </div>
            )}
            <div>
              <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Tier</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)" }}>
                {tierLabels[plan.membership_tier] || "Plus"}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Frequency</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>{frequencyLabels[plan.frequency] || plan.frequency}</dd>
            </div>
            <div>
              <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Annual Price</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)" }}>
                ${((plan.annual_price_cents || plan.price_cents * (plan.annual_visit_count || 1)) / 100).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Billing</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>{billingLabels[plan.billing_cadence] || "Annual"}</dd>
            </div>
            <div>
              <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Visits Per Year</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>{plan.annual_visit_count || 2}</dd>
            </div>
            <div>
              <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Included Labor Cap</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>{plan.included_labor_minutes_per_visit || 60} minutes / visit</dd>
            </div>
            <div>
              <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Routing Zone</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>{zoneLabels[plan.routing_zone] || "Core Zone"}</dd>
            </div>
            {plan.next_scheduled_date && (
              <div>
                <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Next Scheduled</dt>
                <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>
                  {new Date(plan.next_scheduled_date).toLocaleDateString()}
                </dd>
              </div>
            )}
            {plan.renewal_date && (
              <div>
                <dt style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Renewal Date</dt>
                <dd style={{ margin: "2px 0 0", fontSize: "var(--text-sm)" }}>
                  {new Date(plan.renewal_date).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        <Card padding="default">
          <h3 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--fg-muted)", textTransform: "uppercase" }}>
            Services Included
          </h3>
          {plan.services.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: "var(--space-4)", fontSize: "var(--text-sm)" }}>
              {plan.services.map((service, i) => (
                <li key={i} style={{ marginBottom: "var(--space-1)" }}>{service}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>No services listed.</p>
          )}
          {plan.notes && (
            <>
              <h4 style={{ margin: "var(--space-4) 0 var(--space-2)", fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", color: "var(--fg-muted)", textTransform: "uppercase" }}>
                Notes
              </h4>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", whiteSpace: "pre-wrap" }}>{plan.notes}</p>
            </>
          )}
          {plan.membership_terms && (
            <>
              <h4 style={{ margin: "var(--space-4) 0 var(--space-2)", fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", color: "var(--fg-muted)", textTransform: "uppercase" }}>
                Membership Terms
              </h4>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", whiteSpace: "pre-wrap" }}>{plan.membership_terms}</p>
            </>
          )}
        </Card>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
        {plan.status === "active" && (
          <form
            action={async () => {
              "use server";
              await query(
                `UPDATE maintenance_plans
                 SET status = $1, updated_at = now()
                 WHERE id = $2 AND account_id = $3`,
                ["paused", id, session.accountId]
              );
              redirect(`/app/maintenance-plans/${id}`);
            }}
          >
            <button type="submit" className="p7-btn p7-btn-secondary p7-btn-md">
              Pause Plan
            </button>
          </form>
        )}
        {plan.status === "paused" && (
          <form
            action={async () => {
              "use server";
              await query(
                `UPDATE maintenance_plans
                 SET status = $1, updated_at = now()
                 WHERE id = $2 AND account_id = $3`,
                ["active", id, session.accountId]
              );
              redirect(`/app/maintenance-plans/${id}`);
            }}
          >
            <button type="submit" className="p7-btn p7-btn-primary p7-btn-md">
              Resume Plan
            </button>
          </form>
        )}
        {plan.status !== "cancelled" && (
          <form
            action={async () => {
              "use server";
              await query(
                `UPDATE maintenance_plans
                 SET status = $1, updated_at = now()
                 WHERE id = $2 AND account_id = $3`,
                ["cancelled", id, session.accountId]
              );
              redirect(`/app/maintenance-plans/${id}`);
            }}
          >
            <button type="submit" className="p7-btn p7-btn-danger p7-btn-md">
              Cancel Plan
            </button>
          </form>
        )}
      </div>

      {/* Generated visits */}
      <h2 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)", marginBottom: "var(--space-3)" }}>
        Generated Visits
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {visits.map((visit) => (
          <Link
            key={visit.id}
            href={`/app/visits/${visit.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Card hover padding="sm">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)" }}>
                    {visit.job_title || "Visit"}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                    {visit.scheduled_start
                      ? new Date(visit.scheduled_start).toLocaleDateString()
                      : "Not scheduled"}
                    {visit.included_labor_cap_minutes !== null && (
                      <> &middot; Cap: {visit.included_labor_minutes_used}/{visit.included_labor_cap_minutes} min</>
                    )}
                  </div>
                </div>
                <StatusBadge variant={visit.status as StatusVariant}>
                  {visit.status}
                </StatusBadge>
              </div>
            </Card>
          </Link>
        ))}
        {visits.length === 0 && (
          <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>No visits generated yet.</p>
        )}
      </div>
    </PageContainer>
  );
}
