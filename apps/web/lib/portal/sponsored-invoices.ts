import type { SponsoredPurpose } from "@/lib/invoices/sponsored";

export interface SponsoredInvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  paid_cents: number;
  deposit_cents: number | null;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  share_token: string;
  sponsored_purpose: SponsoredPurpose;
  business_purpose: string | null;
  work_summary: string | null;
  property_name: string | null;
  property_address: string;
  beneficiary_name: string | null;
}

type Queryable = {
  query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
};

/**
 * Payer-only projection of realtor-sponsored work (TASK-158).
 *
 * Access comes from being the invoice payer, never from a property_contacts
 * relationship. Selects invoice facts, the property's name/address, and the
 * beneficiary display name (when set) only — no property notes, vault, jobs, visits,
 * contact email/phone, or other people's invoices.
 */
export async function loadSponsoredInvoices(
  db: Queryable,
  clientId: string,
): Promise<SponsoredInvoiceRow[]> {
  const { rows } = await db.query(
    `SELECT i.id, i.invoice_number, i.status, i.total_cents, i.paid_cents, i.deposit_cents,
            i.due_date, i.sent_at, i.paid_at, i.share_token,
            i.sponsored_purpose, i.business_purpose, i.work_summary,
            p.name AS property_name, p.address AS property_address,
            COALESCE(contact_client.name, pc.external_name) AS beneficiary_name
     FROM invoices i
     JOIN properties p ON p.id = i.property_id AND p.account_id = i.account_id
     LEFT JOIN property_contacts pc
       ON pc.id = i.beneficiary_property_contact_id
      AND pc.property_id = i.property_id
      AND pc.account_id = i.account_id
     LEFT JOIN clients contact_client
       ON contact_client.id = pc.client_id AND contact_client.account_id = i.account_id
     WHERE i.client_id = $1
       AND i.billing_context = 'realtor_sponsored'
       AND i.status <> 'draft'
     ORDER BY p.address, beneficiary_name, i.created_at DESC`,
    [clientId],
  );
  return rows as SponsoredInvoiceRow[];
}
