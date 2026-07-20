import { notFound } from "next/navigation";
import { queryOne, query, getPool } from "@/lib/db";
import { loadSquareSettings } from "@/lib/integrations/square-payments";
import { InvoicePortalClient } from "./InvoicePortalClient";

export const dynamic = "force-dynamic";

interface InvoiceRow extends Record<string, unknown> {
  id: string;
  account_id: string;
  status: string;
  invoice_number: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  deposit_cents: number | null;
  notes: string | null;
  due_date: string | null;
  paid_at: string | null;
  client_name: string;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  account_name: string;
  account_settings: { invoice_terms?: string; deposit_percent?: number; deposit_terms?: string };
}

interface LineItemRow extends Record<string, unknown> {
  id: string;
  description: string;
  quantity: string;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
}

export default async function InvoicePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await queryOne<InvoiceRow>(
    `SELECT
       i.id, i.account_id, i.status, i.invoice_number, i.subtotal_cents, i.tax_cents,
       i.total_cents, i.paid_cents, i.deposit_cents, i.notes, i.due_date,
       i.paid_at,
       c.name AS client_name,
       p.address AS property_address, p.city AS property_city,
       p.state AS property_state, p.zip AS property_zip,
       a.name AS account_name, a.settings AS account_settings
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     JOIN accounts a ON a.id = i.account_id
     LEFT JOIN properties p ON p.id = i.property_id
     WHERE i.share_token = $1`,
    [token]
  );

  if (!invoice) notFound();

  const lineItems = await query<LineItemRow>(
    `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
     FROM invoice_line_items
     WHERE invoice_id = $1 AND visible_to_customer = true
     ORDER BY sort_order`,
    [invoice.id]
  );

  // Online card payment is offered only when the account has Square configured.
  let onlinePaymentAvailable = false;
  const client = await getPool().connect();
  try {
    const square = await loadSquareSettings(client, invoice.account_id);
    onlinePaymentAvailable =
      !!square?.enabled &&
      !!square.secrets.accessToken &&
      !!square.config.locationId;
  } finally {
    client.release();
  }

  return (
    <InvoicePortalClient
      token={token}
      invoice={invoice}
      lineItems={lineItems}
      onlinePaymentAvailable={onlinePaymentAvailable}
    />
  );
}
