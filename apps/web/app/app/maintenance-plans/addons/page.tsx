import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canManageClients } from "@/lib/auth/permissions";
import { PageContainer, PageHeader, LinkButton } from "@/components/ui";
import { AddonsClient } from "./AddonsClient";

export const dynamic = "force-dynamic";

interface AddonRow {
  id: string;
  name: string;
  description: string | null;
  annual_price_cents: number;
  is_active: boolean;
  sort_order: number;
  subscription_count: string;
  [key: string]: unknown;
}

export default async function AddonsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageClients(session.role)) redirect("/app");

  const addons = await query<AddonRow>(
    `SELECT a.*,
            COUNT(sa.id) AS subscription_count
     FROM plan_addons a
     LEFT JOIN subscription_addons sa ON sa.addon_id = a.id
     WHERE a.account_id = $1
     GROUP BY a.id
     ORDER BY a.sort_order, a.name`,
    [session.accountId]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Add-on Catalog"
        subtitle="A la carte services clients can add to any membership — flat annual price per add-on"
        actions={
          <LinkButton href="/app/maintenance-plans" variant="ghost" size="sm">
            ← Subscriptions
          </LinkButton>
        }
      />
      <AddonsClient initialAddons={addons} />
    </PageContainer>
  );
}
