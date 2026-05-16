import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryOne, query } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import { MembershipEditForm } from "./MembershipEditForm";

export const dynamic = "force-dynamic";

interface SubscriptionRow {
  id: string;
  name: string;
  plan_template_id: string | null;
  membership_tier: string;
  frequency: string;
  billing_cadence: string;
  annual_price_cents: number;
  price_cents: number;
  annual_visit_count: number;
  status: string;
  next_scheduled_date: string | null;
  renewal_date: string | null;
  routing_zone: string;
  member_priority: string;
  notes: string | null;
  client_name: string;
  property_address: string | null;
  [key: string]: unknown;
}

export default async function EditMembershipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const [subscription, allAddons, currentAddonIds] = await Promise.all([
    queryOne<SubscriptionRow>(
      `SELECT mp.*, c.name AS client_name, p.address AS property_address
       FROM maintenance_plans mp
       JOIN clients c ON c.id = mp.client_id
       LEFT JOIN properties p ON p.id = mp.property_id
       WHERE mp.id = $1 AND mp.account_id = $2`,
      [id, session.accountId]
    ),
    query<{ id: string; name: string; description: string | null; annual_price_cents: number }>(
      `SELECT id, name, description, annual_price_cents
       FROM plan_addons WHERE account_id = $1 AND is_active = true
       ORDER BY sort_order, name`,
      [session.accountId]
    ),
    query<{ addon_id: string }>(
      `SELECT addon_id FROM subscription_addons WHERE subscription_id = $1 AND account_id = $2`,
      [id, session.accountId]
    ),
  ]);

  if (!subscription) notFound();

  const template = subscription.plan_template_id
    ? await queryOne<{
        id: string; name: string; tier: string;
        visit_count_per_year: number; included_labor_minutes_per_visit: number;
        base_price_cents: number;
      }>(
        `SELECT id, name, tier, visit_count_per_year, included_labor_minutes_per_visit, base_price_cents
         FROM plan_templates WHERE id = $1 AND account_id = $2`,
        [subscription.plan_template_id, session.accountId]
      )
    : null;

  return (
    <PageContainer>
      <PageHeader
        title={`Edit: ${subscription.client_name}`}
        subtitle={subscription.name}
        backHref={`/app/maintenance-plans/${id}`}
        backLabel="Details"
      />
      <Card padding="default">
        <MembershipEditForm
          id={id}
          membership={subscription}
          template={template ?? null}
          allAddons={allAddons}
          currentAddonIds={currentAddonIds.map((r) => r.addon_id)}
        />
      </Card>
    </PageContainer>
  );
}
