import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import EditPlanForm from "./EditPlanForm";

export const dynamic = "force-dynamic";

interface MaintenancePlanRow {
  id: string;
  name: string;
  membership_tier: "essential" | "plus" | "premier";
  frequency: "monthly" | "quarterly" | "biannual" | "annual";
  services: string[];
  price_cents: number;
  annual_visit_count: number;
  included_labor_minutes_per_visit: number;
  billing_cadence: "annual" | "monthly";
  annual_price_cents: number;
  status: "active" | "paused" | "cancelled";
  next_scheduled_date: string | null;
  renewal_date: string | null;
  routing_zone: "core" | "extended" | "out_of_area";
  notes: string | null;
  membership_terms: string | null;
  member_priority: "standard" | "priority" | "vip";
  client_name: string;
  property_address: string | null;
  [key: string]: unknown;
}

export default async function EditMaintenancePlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const plan = await queryOne<MaintenancePlanRow>(
    `SELECT mp.*, c.name AS client_name, p.address AS property_address
     FROM maintenance_plans mp
     JOIN clients c ON c.id = mp.client_id
     LEFT JOIN properties p ON p.id = mp.property_id
     WHERE mp.id = $1 AND mp.account_id = $2`,
    [id, session.accountId]
  );

  if (!plan) notFound();

  return (
    <PageContainer>
      <PageHeader
        title={`Edit ${plan.name}`}
        backHref={`/app/maintenance-plans/${id}`}
        backLabel="Plan Details"
      />
      <Card padding="default">
        <EditPlanForm
          id={id}
          initialName={plan.name}
          initialMembershipTier={plan.membership_tier ?? "plus"}
          initialFrequency={plan.frequency}
          initialServices={plan.services}
          initialAnnualVisitCount={plan.annual_visit_count ?? 2}
          initialIncludedLaborMinutes={plan.included_labor_minutes_per_visit ?? 60}
          initialAnnualPrice={((plan.annual_price_cents || plan.price_cents * (plan.annual_visit_count || 1)) / 100).toFixed(2)}
          initialBillingCadence={plan.billing_cadence ?? "annual"}
          initialStatus={plan.status}
          initialStartDate={plan.next_scheduled_date ?? ""}
          initialRenewalDate={plan.renewal_date ?? ""}
          initialRoutingZone={plan.routing_zone ?? "core"}
          initialNotes={plan.notes ?? ""}
          initialMembershipTerms={plan.membership_terms ?? ""}
          initialMemberPriority={plan.member_priority ?? "standard"}
        />
      </Card>
    </PageContainer>
  );
}
