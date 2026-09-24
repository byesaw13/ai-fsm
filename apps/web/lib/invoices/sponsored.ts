import type { PoolClient } from "pg";

export type BillingContext = "standard" | "realtor_sponsored";
export type SponsoredPurpose =
  | "pre_listing"
  | "inspection_closing"
  | "staging_appearance"
  | "client_concierge"
  | "ongoing_care"
  | "other";

export const SPONSORED_PURPOSES = [
  "pre_listing",
  "inspection_closing",
  "staging_appearance",
  "client_concierge",
  "ongoing_care",
  "other",
] as const satisfies readonly SponsoredPurpose[];

export const SPONSORED_PURPOSE_LABELS: Record<SponsoredPurpose, string> = {
  pre_listing: "Pre-listing preparation",
  inspection_closing: "Inspection or closing work",
  staging_appearance: "Staging and appearance",
  client_concierge: "Client concierge",
  ongoing_care: "Ongoing property care",
  other: "Other realtor-sponsored work",
};

export function formatSponsoredInvoiceLabel(input: {
  propertyAddress: string;
  beneficiaryName: string;
  workSummary: string | null;
  invoiceNumber: string;
}) {
  const summary = input.workSummary?.split("\n").map((line) => line.trim()).find(Boolean);
  return `${input.propertyAddress} — ${input.beneficiaryName} — ${summary ?? `Invoice ${input.invoiceNumber}`}`;
}

export type InvoiceContextInput = {
  payerClientId: string;
  jobId?: string | null;
  propertyId?: string | null;
  billingContext: BillingContext;
  sponsoredPurpose?: SponsoredPurpose | null;
  beneficiaryPropertyContactId?: string | null;
  businessPurpose?: string | null;
};

function contextError(message: string, code: "NOT_FOUND" | "VALIDATION_ERROR") {
  return Object.assign(new Error(message), { code });
}

export async function validateInvoiceContext(
  client: PoolClient,
  accountId: string,
  input: InvoiceContextInput,
) {
  const payer = await client.query(`SELECT id FROM clients WHERE id = $1 AND account_id = $2`, [input.payerClientId, accountId]);
  if (!payer.rows[0]) throw contextError("Invoice payer not found", "NOT_FOUND");

  if (input.jobId) {
    const job = await client.query(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2 AND client_id = $3`,
      [input.jobId, accountId, input.payerClientId],
    );
    if (!job.rows[0]) throw contextError("Project must belong to the invoice payer", "VALIDATION_ERROR");
  }

  if (input.billingContext === "standard") {
    if (input.sponsoredPurpose || input.beneficiaryPropertyContactId || input.businessPurpose) {
      throw contextError("Standard invoice cannot contain sponsored-work fields", "VALIDATION_ERROR");
    }
    if (!input.propertyId) return;
    const property = await client.query<{ client_id: string | null }>(
      `SELECT client_id FROM properties WHERE id = $1 AND account_id = $2`,
      [input.propertyId, accountId],
    );
    if (!property.rows[0]) throw contextError("Property not found", "NOT_FOUND");
    if (property.rows[0].client_id !== input.payerClientId) {
      throw contextError("Standard invoice property must belong to the invoice payer", "VALIDATION_ERROR");
    }
    return;
  }

  if (!input.propertyId || !input.sponsoredPurpose || !input.beneficiaryPropertyContactId) {
    throw contextError("Sponsored invoice requires property, beneficiary, and purpose", "VALIDATION_ERROR");
  }
  const property = await client.query(`SELECT id FROM properties WHERE id = $1 AND account_id = $2`, [input.propertyId, accountId]);
  if (!property.rows[0]) throw contextError("Property not found", "NOT_FOUND");

  const beneficiary = await client.query(
    `SELECT id FROM property_contacts WHERE id = $1 AND property_id = $2 AND account_id = $3`,
    [input.beneficiaryPropertyContactId, input.propertyId, accountId],
  );
  if (!beneficiary.rows[0]) {
    throw contextError("Beneficiary must belong to the selected property", "VALIDATION_ERROR");
  }
}
