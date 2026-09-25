import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type PoolClient } from "pg";
import { loadSponsoredInvoices } from "../sponsored-invoices";
import { loadInvoicePdf } from "@/lib/pdf/load";
import { pdfDrawnText } from "@/lib/pdf/__tests__/pdf-text";

const RUN = Boolean(process.env.TEST_DATABASE_URL);
const ACCOUNT_A = "11111111-1111-1111-1111-111111111111";
const OWNER_A = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("payer-only sponsored invoice portal projection", () => {
  let db: Client;
  const kim = randomUUID();
  const peter = randomUUID();
  const otherRealtor = randomUUID();
  const ash = randomUUID();
  const kimContact = randomUUID();
  const otherRealtorContact = randomUUID();
  const peterBeneficiary = randomUUID();
  const kimInvoice = randomUUID();
  const kimDraft = randomUUID();
  const peterInvoice = randomUUID();
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    await db.query(
      `SELECT set_config('app.current_account_id', $1, false),
              set_config('app.current_user_id', $2, false),
              set_config('app.current_role', 'owner', false)`,
      [ACCOUNT_A, OWNER_A],
    );
    await db.query(
      `INSERT INTO clients (id, account_id, name) VALUES
       ($1, $4, 'Portal Kim'), ($2, $4, 'Portal Peter'), ($3, $4, 'Portal Other Realtor')`,
      [kim, peter, otherRealtor, ACCOUNT_A],
    );
    await db.query(
      `INSERT INTO properties (id, account_id, client_id, address, notes)
       VALUES ($1, $2, $3, '4 Ash St', 'Gate code 1234')`,
      [ash, ACCOUNT_A, peter],
    );
    await db.query(
      `INSERT INTO property_contacts (id, account_id, property_id, client_id, role) VALUES
       ($1, $4, $5, $6, 'realtor'),
       ($2, $4, $5, $7, 'realtor'),
       ($3, $4, $5, $8, 'beneficiary')`,
      [kimContact, otherRealtorContact, peterBeneficiary, ACCOUNT_A, ash, kim, otherRealtor, peter],
    );
    await db.query(
      `INSERT INTO invoices
         (id, account_id, client_id, property_id, invoice_number, status, total_cents,
          billing_context, sponsored_purpose, beneficiary_property_contact_id, business_purpose, created_by)
       VALUES
         ($1, $3, $4, $5, $6, 'sent', 50000, 'realtor_sponsored', 'pre_listing', $8, 'Listing prep', $9),
         ($2, $3, $4, $5, $7, 'draft', 1000, 'realtor_sponsored', 'other', $8, NULL, $9)`,
      [kimInvoice, kimDraft, ACCOUNT_A, kim, ash, `KIM-4ASH-${suffix}`, `KIM-DRAFT-${suffix}`, peterBeneficiary, OWNER_A],
    );
    await db.query(
      `INSERT INTO invoices (id, account_id, client_id, property_id, invoice_number, status, total_cents, created_by)
       VALUES ($1, $2, $3, $4, $5, 'sent', 20000, $6)`,
      [peterInvoice, ACCOUNT_A, peter, ash, `PETER-4ASH-${suffix}`, OWNER_A],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM invoices WHERE id = ANY($1::uuid[])`, [[kimInvoice, kimDraft, peterInvoice]]).catch(() => undefined);
    await db.query(`DELETE FROM property_contacts WHERE property_id = $1`, [ash]).catch(() => undefined);
    await db.query(`DELETE FROM properties WHERE id = $1`, [ash]).catch(() => undefined);
    await db.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [[kim, peter, otherRealtor]]).catch(() => undefined);
    await db.end();
  });

  it("returns only the payer's non-draft sponsored invoices with minimal fields", async () => {
    const rows = await loadSponsoredInvoices(db, kim);
    expect(rows.map((row) => row.invoice_number)).toEqual([`KIM-4ASH-${suffix}`]);
    expect(rows[0]).toMatchObject({
      property_address: "4 Ash St",
      beneficiary_name: "Portal Peter",
      sponsored_purpose: "pre_listing",
      business_purpose: "Listing prep",
    });
    expect(Object.keys(rows[0]).sort()).toEqual([
      "beneficiary_name", "business_purpose", "deposit_cents", "due_date", "id", "invoice_number",
      "paid_at", "paid_cents", "property_address", "property_name", "sent_at",
      "share_token", "sponsored_purpose", "status", "total_cents", "work_summary",
    ]);
  });

  it("does not show the property's primary contact another payer's sponsored invoice", async () => {
    const rows = await loadSponsoredInvoices(db, peter);
    expect(rows).toEqual([]);
  });

  it("grants nothing to a realtor relationship without billing", async () => {
    expect(await loadSponsoredInvoices(db, otherRealtor)).toEqual([]);
  });

  it("lists sponsored work that has no beneficiary (TASK-159)", async () => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO invoices
         (id, account_id, client_id, property_id, invoice_number, status, total_cents,
          billing_context, sponsored_purpose, created_by)
       VALUES ($1, $2, $3, $4, $5, 'sent', 700, 'realtor_sponsored', 'other', $6)`,
      [id, ACCOUNT_A, kim, ash, `KIM-NOBEN-${suffix}`, OWNER_A],
    );
    try {
      const row = (await loadSponsoredInvoices(db, kim)).find((r) => r.id === id);
      expect(row).toMatchObject({ property_address: "4 Ash St", beneficiary_name: null });
      expect(await loadSponsoredInvoices(db, peter)).toEqual([]);
    } finally {
      await db.query(`DELETE FROM invoices WHERE id = $1`, [id]);
    }
  });

  it("renders the sponsored block on the stored invoice PDF", async () => {
    const pdf = await loadInvoicePdf(db as unknown as PoolClient, ACCOUNT_A, kimInvoice);
    const text = pdfDrawnText(pdf!.bytes);
    for (const expected of ["REALTOR-SPONSORED PROPERTY EXPENSE", "Portal Kim", "Portal Peter", "Pre-listing preparation", "Listing prep", "4 Ash St"]) {
      expect(text).toContain(expected);
    }
    const standard = await loadInvoicePdf(db as unknown as PoolClient, ACCOUNT_A, peterInvoice);
    expect(pdfDrawnText(standard!.bytes)).not.toContain("REALTOR-SPONSORED");
  });

  it.skipIf(!process.env.TEST_BASE_URL)("shows sponsored context on the share-token invoice page", async () => {
    const { rows } = await db.query<{ share_token: string }>(`SELECT share_token FROM invoices WHERE id = $1`, [kimInvoice]);
    const res = await fetch(`${process.env.TEST_BASE_URL}/portal/invoices/${rows[0].share_token}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("sponsored-details");
    expect(html).toContain("Portal Peter");
    expect(html).not.toContain("Gate code 1234");
  });
});
