import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUN = Boolean(process.env.TEST_DATABASE_URL);
const ACCOUNT_A = "11111111-1111-1111-1111-111111111111";
const OWNER_A = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("realtor-sponsored property constraints", () => {
  let db: Client;
  const accountB = randomUUID();
  const ownerB = randomUUID();
  const clientA = randomUUID();
  const otherClientA = randomUUID();
  const clientB = randomUUID();
  const propertyA = randomUUID();
  const otherPropertyA = randomUUID();
  const propertyB = randomUUID();
  const invoiceA = randomUUID();
  const createdProperties: string[] = [];

  beforeAll(async () => {
    db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    await db.query(
      `SELECT set_config('app.current_account_id', $1, false),
              set_config('app.current_user_id', $2, false),
              set_config('app.current_role', 'owner', false)`,
      [ACCOUNT_A, OWNER_A],
    );
    await db.query(`INSERT INTO accounts (id, name) VALUES ($1, 'Sponsored Test B')`, [accountB]);
    await db.query(
      `INSERT INTO users (id, account_id, email, full_name, password_hash, role)
       VALUES ($1, $2, $3, 'Sponsored Owner B', 'test', 'owner')`,
      [ownerB, accountB, `sponsored-${accountB}@example.com`],
    );
    await db.query(
      `INSERT INTO clients (id, account_id, name) VALUES
       ($1, $4, 'Sponsored Payer A'),
       ($2, $4, 'Sponsored Other A'),
       ($3, $5, 'Sponsored Client B')`,
      [clientA, otherClientA, clientB, ACCOUNT_A, accountB],
    );
    await db.query(
      `INSERT INTO properties (id, account_id, client_id, address) VALUES
       ($1, $4, $5, '10 Same Account Way'),
       ($2, $4, $6, '20 Other Client Way'),
       ($3, $7, $8, '30 Foreign Account Way')`,
      [propertyA, otherPropertyA, propertyB, ACCOUNT_A, clientA, otherClientA, accountB, clientB],
    );
    await db.query(
      `INSERT INTO invoices
         (id, account_id, client_id, property_id, invoice_number, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [invoiceA, ACCOUNT_A, clientA, propertyA, `SP-${Date.now()}`, OWNER_A],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM invoices WHERE id = $1`, [invoiceA]).catch(() => undefined);
    const hasContacts = await db.query<{ present: boolean }>(
      `SELECT to_regclass('public.property_contacts') IS NOT NULL AS present`,
    );
    if (hasContacts.rows[0]?.present) {
      await db.query(`DELETE FROM property_contacts WHERE property_id = ANY($1::uuid[])`, [
        [propertyA, otherPropertyA, propertyB, ...createdProperties],
      ]).catch(() => undefined);
    }
    const hasPrimary = await db.query<{ present: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'primary_property_id'
       ) AS present`,
    );
    if (hasPrimary.rows[0]?.present) {
      await db.query(`UPDATE clients SET primary_property_id = NULL WHERE id = ANY($1::uuid[])`, [
        [clientA, otherClientA, clientB],
      ]).catch(() => undefined);
    }
    await db.query(`DELETE FROM properties WHERE id = ANY($1::uuid[])`, [
      [propertyA, otherPropertyA, propertyB, ...createdProperties],
    ]).catch(() => undefined);
    await db.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [[clientA, otherClientA, clientB]]).catch(() => undefined);
    await db.query(`DELETE FROM accounts WHERE id = $1`, [accountB]).catch(() => undefined);
    await db.end();
  });

  it("allows an ownerless property with one external beneficiary", async () => {
    const ownerless = randomUUID();
    createdProperties.push(ownerless);
    await db.query(
      `INSERT INTO properties (id, account_id, client_id, address)
       VALUES ($1, $2, NULL, '96 Richardson Road')`,
      [ownerless, ACCOUNT_A],
    );
    const contact = await db.query<{ id: string }>(
      `INSERT INTO property_contacts (account_id, property_id, external_name, role)
       VALUES ($1, $2, 'Emma', 'beneficiary') RETURNING id`,
      [ACCOUNT_A, ownerless],
    );
    expect(contact.rows[0]?.id).toBeTruthy();
  });

  it("requires exactly one contact identity", async () => {
    await expect(
      db.query(
        `INSERT INTO property_contacts
           (account_id, property_id, client_id, external_name, role)
         VALUES ($1, $2, $3, 'Emma', 'beneficiary')`,
        [ACCOUNT_A, propertyA, clientA],
      ),
    ).rejects.toThrow(/property_contact_one_identity/);
    await expect(
      db.query(
        `INSERT INTO property_contacts (account_id, property_id, external_name, role)
         VALUES ($1, $2, ' ', 'beneficiary')`,
        [ACCOUNT_A, propertyA],
      ),
    ).rejects.toThrow(/property_contact_one_identity/);
  });

  it("rejects cross-account property contacts", async () => {
    await expect(
      db.query(
        `INSERT INTO property_contacts (account_id, property_id, client_id, role)
         VALUES ($1, $2, $3, 'realtor')`,
        [ACCOUNT_A, propertyB, clientA],
      ),
    ).rejects.toThrow(/property_contacts must reference a property in the same account/);
    await expect(
      db.query(
        `INSERT INTO property_contacts (account_id, property_id, client_id, role)
         VALUES ($1, $2, $3, 'realtor')`,
        [ACCOUNT_A, propertyA, clientB],
      ),
    ).rejects.toThrow(/registered property contact must reference a client in the same account/);
  });

  it("requires a sponsored beneficiary on the selected property", async () => {
    const onOtherProperty = await db.query<{ id: string }>(
      `INSERT INTO property_contacts (account_id, property_id, external_name, role)
       VALUES ($1, $2, 'Other beneficiary', 'beneficiary') RETURNING id`,
      [ACCOUNT_A, otherPropertyA],
    );
    await expect(
      db.query(
        `UPDATE invoices
         SET billing_context = 'realtor_sponsored', sponsored_purpose = 'other',
             beneficiary_property_contact_id = $1
         WHERE id = $2`,
        [onOtherProperty.rows[0].id, invoiceA],
      ),
    ).rejects.toThrow(/sponsored beneficiary must belong to selected property/);

    const onSelectedProperty = await db.query<{ id: string }>(
      `INSERT INTO property_contacts (account_id, property_id, external_name, role)
       VALUES ($1, $2, 'Selected beneficiary', 'beneficiary') RETURNING id`,
      [ACCOUNT_A, propertyA],
    );
    const updated = await db.query<{ billing_context: string }>(
      `UPDATE invoices
       SET billing_context = 'realtor_sponsored', sponsored_purpose = 'other',
           beneficiary_property_contact_id = $1
       WHERE id = $2 RETURNING billing_context`,
      [onSelectedProperty.rows[0].id, invoiceA],
    );
    expect(updated.rows[0]?.billing_context).toBe("realtor_sponsored");

    await db.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [invoiceA]);
    await expect(
      db.query(`UPDATE invoices SET business_purpose = 'Changed after send' WHERE id = $1`, [invoiceA]),
    ).rejects.toThrow(/invoice in sent state/);
  });

  it("protects a beneficiary referenced by an invoice", async () => {
    const invoice = await db.query<{ beneficiary_property_contact_id: string }>(
      `SELECT beneficiary_property_contact_id FROM invoices WHERE id = $1`,
      [invoiceA],
    );
    await expect(
      db.query(`DELETE FROM property_contacts WHERE id = $1`, [invoice.rows[0].beneficiary_property_contact_id]),
    ).rejects.toThrow(/invoices_beneficiary_property_contact_id_fkey/);
  });

  it("keeps a client's main property in the same service relationship", async () => {
    await expect(
      db.query(`UPDATE clients SET primary_property_id = $1 WHERE id = $2`, [otherPropertyA, clientA]),
    ).rejects.toThrow(/main property must use this client as primary service contact/);
    await db.query(`UPDATE clients SET primary_property_id = $1 WHERE id = $2`, [propertyA, clientA]);
    await expect(
      db.query(`UPDATE properties SET client_id = $1 WHERE id = $2`, [otherClientA, propertyA]),
    ).rejects.toThrow(/property is selected as a client's main property/);
  });
});
