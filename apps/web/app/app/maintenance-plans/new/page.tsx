import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
import {
  Card,
  PageContainer,
  PageHeader,
} from "@/components/ui";
import NewPlanForm from "./NewPlanForm";

export const dynamic = "force-dynamic";

interface ClientRow {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface PropertyRow {
  id: string;
  address: string;
  client_id: string;
  client_name?: string;
  [key: string]: unknown;
}

export default async function NewMaintenancePlanPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app/maintenance-plans");

  const clients = await query<ClientRow>(
    `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name`,
    [session.accountId]
  );

  const properties = await query<PropertyRow>(
    `SELECT p.id, p.address, p.client_id, c.name AS client_name
     FROM properties p
     JOIN clients c ON c.id = p.client_id
     WHERE p.account_id = $1
     ORDER BY p.address`,
    [session.accountId]
  );

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const propertyOptions = properties.map((p) => ({
    value: p.id,
    label: `${p.address} (${p.client_name || ""})`,
  }));

  const frequencyOptions = [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "biannual", label: "Bi-annual" },
    { value: "annual", label: "Annual" },
  ];

  return (
    <PageContainer>
      <PageHeader title="New Maintenance Plan" backHref="/app/maintenance-plans" backLabel="Plans" />
      <Card padding="default">
        <NewPlanForm
          clientOptions={clientOptions}
          propertyOptions={[{ value: "", label: "None" }, ...propertyOptions]}
          frequencyOptions={frequencyOptions}
        />
      </Card>
    </PageContainer>
  );
}
