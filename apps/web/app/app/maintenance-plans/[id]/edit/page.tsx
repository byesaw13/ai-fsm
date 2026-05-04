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
  frequency: "monthly" | "quarterly" | "biannual" | "annual";
  services: string[];
  price_cents: number;
  status: "active" | "paused" | "cancelled";
  next_scheduled_date: string | null;
  notes: string | null;
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
          initialFrequency={plan.frequency}
          initialServices={plan.services}
          initialPrice={(plan.price_cents / 100).toFixed(2)}
          initialStatus={plan.status}
          initialStartDate={plan.next_scheduled_date ?? ""}
          initialNotes={plan.notes ?? ""}
        />
      </Card>
    </PageContainer>
  );
}
