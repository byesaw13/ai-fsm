import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import MaterialsCatalogClient from "./MaterialsCatalogClient";

export const dynamic = "force-dynamic";

export type MaterialCatalogRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  unit: string;
  unit_cost_cents: number;
  avg_paid_cents: number | null;
  purchase_count: number;
  supplier: string | null;
  sku: string | null;
  last_purchased_at: string | null;
  notes: string | null;
  updated_at: string;
};

export default async function MaterialsCatalogPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-work");

  const materials = await query<MaterialCatalogRow>(
    `SELECT id, name, brand, category, unit, unit_cost_cents,
            avg_paid_cents, purchase_count, supplier, sku,
            last_purchased_at::text AS last_purchased_at,
            notes, updated_at::text AS updated_at
     FROM materials_price_book
     WHERE account_id = $1 AND is_active = true
     ORDER BY last_purchased_at DESC NULLS LAST, name ASC
     LIMIT 2000`,
    [session.accountId],
  );

  return (
    <MaterialsCatalogClient
      materials={materials}
      canManage={session.role === "owner" || session.role === "admin"}
    />
  );
}
