import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import PriceBookClient from "./PriceBookClient";

export const dynamic = "force-dynamic";

type PriceBookRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  tier: string;
  price_min_cents: number;
  price_max_cents: number | null;
  description: string | null;
  notes: string | null;
  default_labor_hours: number | null;
  requires_materials: boolean;
  upsell_codes: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export default async function PriceBookPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const services = await query<PriceBookRow>(
    `SELECT id, code, name, category, tier, price_min_cents, price_max_cents,
            description, notes, default_labor_hours::float, requires_materials,
            upsell_codes, is_active, created_at::text, updated_at::text
     FROM price_book
     ORDER BY code ASC`
  );

  return <PriceBookClient services={services} />;
}
