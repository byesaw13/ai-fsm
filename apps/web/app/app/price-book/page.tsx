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
  default_price_cents: number | null;
  add_on_price_cents: number | null;
  unit_type: string | null;
  description: string | null;
  notes: string | null;
  default_labor_hours: number | null;
  requires_materials: boolean;
  upsell_codes: string[];
  is_active: boolean;
  default_trip_count: number;
  return_trip_required: boolean;
  material_inclusion: "none_needed" | "customer_supplied" | "tech_supplied_included" | "billed_separately";
  risk_flags: string[];
  created_at: string;
  updated_at: string;
};

export default async function PriceBookPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day"); // EPIC-006: techs have no pricing access

  const services = await query<PriceBookRow>(
    `SELECT id, code, name, category, tier, price_min_cents, price_max_cents,
            default_price_cents, add_on_price_cents, unit_type,
            description, notes, default_labor_hours::float, requires_materials,
            COALESCE(upsell_codes, '{}') AS upsell_codes, is_active,
            default_trip_count, return_trip_required, material_inclusion,
            COALESCE(risk_flags, '{}') AS risk_flags,
            created_at::text, updated_at::text
     FROM price_book
     ORDER BY code ASC`
  );

  return <PriceBookClient services={services} />;
}
