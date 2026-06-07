import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { Card, PageContainer, PageHeader } from "@/components/ui";
import { PricingManager } from "./PricingManager";

export const dynamic = "force-dynamic";

interface PricingRow extends Record<string, unknown> {
  id: string;
  tier: string;
  annual_price_cents: number;
  monthly_price_cents: number;
  is_published: boolean;
  published_at: string | null;
  notes: string | null;
}

// MEMBERSHIPS PAUSED — redirects until feature is re-enabled.
export default async function MembershipPricingPage() {
  redirect("/app/settings");
}

async function _MembershipPricingPage_Paused() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner" && session.role !== "admin") redirect("/app/settings");

  const rows = await query<PricingRow>(
    `SELECT id, tier, annual_price_cents, monthly_price_cents, is_published, published_at, notes
     FROM membership_pricing_structures
     WHERE account_id = $1
     ORDER BY tier, created_at DESC`,
    [session.accountId]
  );

  // Only pass the most relevant row per tier (published first, then latest)
  const byTier: Record<string, PricingRow[]> = {};
  for (const row of rows) {
    (byTier[row.tier] ??= []).push(row);
  }
  const displayRows: PricingRow[] = Object.values(byTier).map(
    (tierRows) => tierRows.find((r) => r.is_published) ?? tierRows[0]
  ).filter(Boolean) as PricingRow[];

  return (
    <PageContainer>
      <PageHeader
        title="Membership Pricing"
        backHref="/app/settings"
        backLabel="Settings"
      />
      <Card padding="default">
        <p style={{ margin: "0 0 var(--space-4)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Set a published price for each membership tier. Published prices automatically
          pre-fill the annual price when creating a new maintenance plan.
        </p>
        <PricingManager initial={displayRows} />
      </Card>
    </PageContainer>
  );
}
