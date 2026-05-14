import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import { EnrollmentForm } from "./EnrollmentForm";

export const dynamic = "force-dynamic";

export default async function NewMaintenancePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const { client_id: defaultClientId } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app/maintenance-plans");

  const [clients, properties, templates, addons] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE account_id = $1 ORDER BY name`,
      [session.accountId]
    ),
    query<{ id: string; address: string; client_id: string; client_name: string }>(
      `SELECT p.id, p.address, p.client_id, c.name AS client_name
       FROM properties p
       JOIN clients c ON c.id = p.client_id
       WHERE p.account_id = $1 ORDER BY p.address`,
      [session.accountId]
    ),
    query<{
      id: string; name: string; tier: string; description: string | null;
      visit_count_per_year: number; included_labor_minutes_per_visit: number;
      base_price_cents: number; included_features: string[]; is_active: boolean; sort_order: number;
    }>(
      `SELECT * FROM plan_templates WHERE account_id = $1 AND is_active = true ORDER BY sort_order, name`,
      [session.accountId]
    ),
    query<{ id: string; name: string; description: string | null; annual_price_cents: number }>(
      `SELECT id, name, description, annual_price_cents FROM plan_addons WHERE account_id = $1 AND is_active = true ORDER BY sort_order, name`,
      [session.accountId]
    ),
  ]);

  return (
    <PageContainer>
      <PageHeader title="Enroll Client" backHref="/app/maintenance-plans" backLabel="Memberships" />
      <Card padding="default">
        <EnrollmentForm
          clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
          propertyOptions={[
            { value: "", label: "No specific property" },
            ...properties.map((p) => ({ value: p.id, label: `${p.address} (${p.client_name})` })),
          ]}
          templates={templates}
          addons={addons}
          defaultClientId={defaultClientId}
        />
      </Card>
    </PageContainer>
  );
}
