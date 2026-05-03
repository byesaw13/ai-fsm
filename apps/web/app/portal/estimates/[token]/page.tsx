import { notFound } from "next/navigation";
import { queryOne, query } from "@/lib/db";
import { EstimatePortalClient } from "./EstimatePortalClient";

export const dynamic = "force-dynamic";

interface EstimateRow extends Record<string, unknown> {
  id: string;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number | null;
  notes: string | null;
  expires_at: string | null;
  responded_at: string | null;
  client_approved_name: string | null;
  client_name: string;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  account_name: string;
}

interface LineItemRow extends Record<string, unknown> {
  id: string;
  description: string;
  quantity: string;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
}

export default async function EstimatePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const estimate = await queryOne<EstimateRow>(
    `SELECT
       e.id, e.status, e.subtotal_cents, e.tax_cents, e.total_cents,
       e.deposit_cents, e.notes, e.expires_at, e.responded_at,
       e.client_approved_name,
       c.name AS client_name,
       p.address AS property_address, p.city AS property_city,
       p.state AS property_state, p.zip AS property_zip,
       a.name AS account_name
     FROM estimates e
     JOIN clients c ON c.id = e.client_id
     JOIN accounts a ON a.id = e.account_id
     LEFT JOIN properties p ON p.id = e.property_id
     WHERE e.share_token = $1`,
    [token]
  );

  if (!estimate) notFound();

  const lineItems = await query<LineItemRow>(
    `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
     FROM estimate_line_items
     WHERE estimate_id = $1 AND visible_to_customer = true
     ORDER BY sort_order`,
    [estimate.id]
  );

  return (
    <EstimatePortalClient
      token={token}
      estimate={estimate}
      lineItems={lineItems}
    />
  );
}
