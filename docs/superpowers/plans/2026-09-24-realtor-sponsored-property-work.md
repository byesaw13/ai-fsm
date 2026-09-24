# Realtor-Sponsored Property Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Dovetails record and present realtor-paid work at another person's property while exposing only the invoices billed to that realtor.

**Architecture:** Extend the existing property and invoice records instead of creating a parallel realtor subsystem. A property keeps an optional primary service contact plus restricted lightweight contacts; an invoice keeps its bill-to client and adds sponsored-work context. The authenticated portal uses a dedicated payer-filtered projection, while the existing PDF, print, list, and export paths render the same frozen invoice facts.

**Tech Stack:** PostgreSQL migrations and RLS, Next.js 15 App Router, React 19, TypeScript, Zod, `pg`, `pdf-lib`, Vitest, existing Google Drive connector.

**Spec:** `docs/superpowers/specs/2026-09-24-realtor-sponsored-property-work-design.md`

## Global Constraints

- Keep one property record; never create a payer-specific duplicate.
- `properties.client_id` means optional primary service contact, not legal ownership.
- A property contact relationship grants no customer-portal access.
- `invoices.client_id` remains the bill-to client and payer.
- The sponsored portal returns only invoices billed to the logged-in client plus minimal property identity and beneficiary display name.
- Never return property notes, vault data, photos, estimates, jobs, visits, other invoices, external contact details, or another person's payment data through sponsored access.
- Sent and paid invoice facts remain immutable.
- The Kim data patch must be transactional, idempotent, send no email, and create no charge.
- Tax-purpose labels are bookkeeping records, not tax advice.
- Add no dependency; reuse Zod, `pg`, `pdf-lib`, the current portal session, and existing document renderers.

## Review Focus

- Cross-account property, client, and contact identifiers must be rejected even when each UUID exists.
- An ownerless property must remain usable in owner property lists, details, and sponsored invoices without enabling job or estimate actions that require a client.
- A realtor contact who is not the invoice payer must receive no property or financial visibility.
- Changing a property's primary contact must not leave another client's `primary_property_id` pointing at it, and referenced beneficiary contacts must not be deletable.
- Standard invoices and old rows must retain their existing behavior, including service-location fallback and sent/paid immutability.

---

## File Map

**Create**

- `db/migrations/194_realtor_sponsored_property_work.sql` — schema, constraints, RLS, validation triggers, and invoice immutability update.
- `apps/web/lib/invoices/sponsored.ts` — shared purpose labels, descriptive labels, and account-scoped invoice-context validation.
- `apps/web/lib/invoices/__tests__/sponsored.unit.test.ts` — pure label and validation-shape tests.
- `apps/web/lib/invoices/__tests__/sponsored.integration.test.ts` — database constraints, account boundaries, main-property rules, and contact deletion protection.
- `apps/web/app/api/v1/properties/[id]/contacts/route.ts` — owner/admin contact list and create endpoint.
- `apps/web/app/api/v1/properties/[id]/contacts/[contactId]/route.ts` — owner/admin contact update and delete endpoint.
- `apps/web/lib/properties/contacts.ts` — shared contact schema and role labels for both nested routes and UI.
- `apps/web/lib/properties/__tests__/contacts.unit.test.ts` — contact identity validation tests.
- `apps/web/lib/properties/__tests__/properties.integration.test.ts` — ownerless property and contact API tests.
- `apps/web/app/app/properties/[id]/PropertyContactsPanel.tsx` — lightweight contact management.
- `apps/web/app/app/properties/[id]/SetMainPropertyButton.tsx` — explicit main-property action.
- `apps/web/lib/portal/sponsored-invoices.ts` — minimal payer-only sponsored invoice projection.
- `apps/web/lib/portal/__tests__/sponsored-invoices.integration.test.ts` — allowed and denied portal query cases.
- `/home/nick/Kim-Tufts-Invoices/link-sponsored-work.sql` — guarded one-time Kim production patch kept with the invoice archive, not application migrations.
- `/home/nick/Kim-Tufts-Invoices/verify-sponsored-work.sql` — production postcondition checks.

**Modify**

- `apps/web/app/api/v1/properties/route.ts` and `apps/web/app/api/v1/properties/[id]/route.ts` — nullable primary contact and ownerless rows.
- `apps/web/app/app/properties/PropertyForm.tsx`, `apps/web/app/app/properties/page.tsx`, and `apps/web/app/app/properties/[id]/page.tsx` — optional primary contact, contacts, and guarded client actions.
- `apps/web/app/api/v1/clients/[id]/route.ts` — same-account main-property validation and update.
- `apps/web/lib/documents/service-location.ts` and its unit test — explicit main-property fallback.
- `apps/web/app/api/v1/invoices/route.ts` and `apps/web/app/api/v1/invoices/[id]/route.ts` — sponsored fields and validation.
- `apps/web/app/app/invoices/new/page.tsx`, `NewInvoiceForm.tsx`, invoice detail page, and `InvoiceEditForm.tsx` — owner create/edit/read workflow.
- `apps/web/app/api/v1/invoices/[id]/document-links/route.ts` — retain sponsored property/contact consistency during link corrections.
- `apps/web/app/portal/[clientToken]/page.tsx` — separate minimal Sponsored Work section.
- `apps/web/lib/pdf/document-pdf.ts`, `apps/web/lib/pdf/load.ts`, and PDF tests — sponsored receipt block.
- `apps/web/app/app/invoices/[id]/print/page.tsx` — matching HTML print block.
- `apps/web/app/api/portal/invoices/[token]/route.ts` and `InvoicePortalClient.tsx` — matching single-invoice display.
- `apps/web/app/app/invoices/page.tsx` and `apps/web/app/api/v1/invoices/route.ts` — descriptive labels in internal lists/API.
- `apps/web/lib/reports/export.ts`, its unit test, and `apps/web/app/api/v1/reports/month-end-export/route.ts` — bookkeeping columns.
- `docs/backlog/TASK-158-realtor-sponsored-properties.md` — final evidence and status after verification.

### Task 1: Add the Database Model and Invariants

**Files:**
- Create: `db/migrations/194_realtor_sponsored_property_work.sql`
- Create: `apps/web/lib/invoices/__tests__/sponsored.integration.test.ts`
- Modify: `apps/web/lib/invoices/__tests__/work-summary-itemized.integration.test.ts`

**Interfaces:**
- Produces: nullable `properties.client_id`; `clients.primary_property_id`; `property_contacts`; invoice columns `billing_context`, `sponsored_purpose`, `beneficiary_property_contact_id`, and `business_purpose`.
- Produces: database guarantees consumed by every later API and portal task.

- [ ] **Step 1: Write the failing database integration cases**

Create integration cases using the existing `TEST_DATABASE_URL` pattern. Pin these behaviors explicitly:

```ts
it("allows an ownerless property and one valid external beneficiary", async () => {
  const property = await client.query(
    `INSERT INTO properties (account_id, client_id, address)
     VALUES ($1, NULL, '96 Richardson Road') RETURNING id`,
    [ACCOUNT_ID],
  );
  const contact = await client.query(
    `INSERT INTO property_contacts (account_id, property_id, external_name, role)
     VALUES ($1, $2, 'Emma', 'beneficiary') RETURNING id`,
    [ACCOUNT_ID, property.rows[0].id],
  );
  expect(contact.rows[0].id).toBeTruthy();
});

it("rejects both contact identities and rejects neither", async () => {
  await expect(client.query(
    `INSERT INTO property_contacts (account_id, property_id, client_id, external_name, role)
     VALUES ($1, $2, $3, 'Emma', 'beneficiary')`,
    [ACCOUNT_ID, propertyId, clientId],
  )).rejects.toThrow();
  await expect(client.query(
    `INSERT INTO property_contacts (account_id, property_id, external_name, role)
     VALUES ($1, $2, ' ', 'beneficiary')`,
    [ACCOUNT_ID, propertyId],
  )).rejects.toThrow();
});

it("rejects a contact whose property or registered client is from another account", async () => {
  await expect(client.query(
    `INSERT INTO property_contacts (account_id, property_id, client_id, role)
     VALUES ($1, $2, $3, 'realtor')`,
    [ACCOUNT_ID, foreignProperty, clientId],
  )).rejects.toThrow();
  await expect(client.query(
    `INSERT INTO property_contacts (account_id, property_id, client_id, role)
     VALUES ($1, $2, $3, 'realtor')`,
    [ACCOUNT_ID, propertyId, foreignClientId],
  )).rejects.toThrow();
});

it("rejects a sponsored beneficiary from another property or account", async () => {
  await expect(client.query(
    `UPDATE invoices SET billing_context = 'realtor_sponsored', property_id = $1,
       beneficiary_property_contact_id = $2, sponsored_purpose = 'other'
     WHERE id = $3`,
    [propertyA, contactOnB, invoiceId],
  )).rejects.toThrow();
  await expect(client.query(
    `UPDATE invoices SET billing_context = 'realtor_sponsored', property_id = $1,
       beneficiary_property_contact_id = $2, sponsored_purpose = 'other'
     WHERE id = $3`,
    [foreignProperty, foreignContact, invoiceId],
  )).rejects.toThrow();
});

it("rejects deleting a beneficiary referenced by an invoice", async () => {
  await expect(client.query(`DELETE FROM property_contacts WHERE id = $1`, [beneficiaryId])).rejects.toThrow();
});

it("accepts only a same-account property served for that client as main", async () => {
  await expect(client.query(
    `UPDATE clients SET primary_property_id = $1 WHERE id = $2`,
    [ownerlessPropertyId, clientId],
  )).rejects.toThrow();
  await expect(client.query(
    `UPDATE clients SET primary_property_id = $1 WHERE id = $2`,
    [otherClientsPropertyId, clientId],
  )).rejects.toThrow();
  await expect(client.query(
    `UPDATE clients SET primary_property_id = $1 WHERE id = $2`,
    [clientsPropertyId, clientId],
  )).resolves.toBeDefined();
  await expect(
    client.query(`UPDATE properties SET client_id = $1 WHERE id = $2`, [otherClientId, clientsPropertyId]),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run the new integration file and confirm the schema is missing**

Run:

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-fsm/web test:integration -- sponsored.integration.test.ts
```

Expected: FAIL because `property_contacts`, `clients.primary_property_id`, and the sponsored invoice columns do not exist.

- [ ] **Step 3: Add migration 194 with native constraints and RLS**

Use database constraints for fixed invariants and small validation triggers only for cross-row relationships:

```sql
ALTER TABLE properties DROP CONSTRAINT properties_client_id_fkey;
ALTER TABLE properties ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE properties
  ADD CONSTRAINT properties_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE clients
  ADD COLUMN primary_property_id uuid REFERENCES properties(id) ON DELETE SET NULL;

CREATE TABLE property_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
  external_name text,
  external_email text,
  external_phone text,
  notes text,
  role text NOT NULL CHECK (role IN ('owner','realtor','beneficiary','property_manager','tenant','other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_contact_one_identity CHECK (
    (client_id IS NOT NULL AND external_name IS NULL AND external_email IS NULL AND external_phone IS NULL)
    OR (client_id IS NULL AND length(btrim(external_name)) > 0)
  )
);

CREATE UNIQUE INDEX property_contacts_registered_role_unique
  ON property_contacts (property_id, client_id, role)
  WHERE client_id IS NOT NULL;

ALTER TABLE invoices
  ADD COLUMN billing_context text NOT NULL DEFAULT 'standard'
    CHECK (billing_context IN ('standard','realtor_sponsored')),
  ADD COLUMN sponsored_purpose text
    CHECK (sponsored_purpose IN ('pre_listing','inspection_closing','staging_appearance','client_concierge','ongoing_care','other')),
  ADD COLUMN beneficiary_property_contact_id uuid
    REFERENCES property_contacts(id) ON DELETE RESTRICT,
  ADD COLUMN business_purpose text;
```

Add `validate_property_contact_context()`, `validate_client_primary_property()`, `protect_primary_property_relationship()`, and `validate_sponsored_invoice_context()` triggers. The contact trigger must require its property and optional registered client to share `NEW.account_id`. The property trigger must reject changing the account or primary client while a client points to that property as main. The invoice trigger must verify the payer belongs to the invoice account, require property, beneficiary, and purpose for `realtor_sponsored`, require sponsored fields to be null for `standard`, and compare account/property IDs. When a job is present it must belong to the invoice account and payer. Enable and force RLS on `property_contacts`; owner/admin may select or write only rows whose `account_id = app_account_id()`.

- [ ] **Step 4: Extend the live invoice immutability function**

Copy the full current `enforce_invoice_immutability()` definition from migration 193 and add the four new columns to every equality and forbidden-change branch. Draft invoices may change them; sent, partial, overdue, paid, and void invoices may not.

Add assertions to the existing immutability test:

```ts
await client.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id]);
await expect(
  client.query(`UPDATE invoices SET business_purpose = 'changed' WHERE id = $1`, [id]),
).rejects.toThrow();
```

- [ ] **Step 5: Apply migrations to the test database and rerun both integration files**

Run the repository's test migration command, then:

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-fsm/web test:integration -- sponsored.integration.test.ts work-summary-itemized.integration.test.ts
```

Expected: PASS, including cross-account, invalid-main-property, and deletion-restrict cases.

- [ ] **Step 6: Commit the database slice**

```bash
git add db/migrations/194_realtor_sponsored_property_work.sql apps/web/lib/invoices/__tests__/sponsored.integration.test.ts apps/web/lib/invoices/__tests__/work-summary-itemized.integration.test.ts
git commit -m "feat: add sponsored property billing model"
```

### Task 2: Support Ownerless Properties, Main Property, and Contacts

**Files:**
- Modify: `apps/web/app/api/v1/properties/route.ts`
- Modify: `apps/web/app/api/v1/properties/[id]/route.ts`
- Create: `apps/web/app/api/v1/properties/[id]/contacts/route.ts`
- Create: `apps/web/app/api/v1/properties/[id]/contacts/[contactId]/route.ts`
- Create: `apps/web/lib/properties/contacts.ts`
- Create: `apps/web/lib/properties/__tests__/contacts.unit.test.ts`
- Create: `apps/web/lib/properties/__tests__/properties.integration.test.ts`
- Modify: `apps/web/app/api/v1/clients/[id]/route.ts`
- Modify: `apps/web/app/app/properties/PropertyForm.tsx`
- Modify: `apps/web/app/app/properties/page.tsx`
- Modify: `apps/web/app/app/properties/[id]/page.tsx`
- Create: `apps/web/app/app/properties/[id]/PropertyContactsPanel.tsx`
- Create: `apps/web/app/app/properties/[id]/SetMainPropertyButton.tsx`

**Interfaces:**
- Consumes: migration 194 columns and role values.
- Produces: property/contact JSON with nullable `client_id`; `PATCH /api/v1/clients/:id` accepts `primary_property_id: uuid | null`.

- [ ] **Step 1: Add failing route/helper tests for ownerless and contact validation**

Add the shared Zod schema in `apps/web/lib/properties/contacts.ts` and focused unit cases:

```ts
expect(() => propertyContactBody.parse({ client_id: clientId, external_name: "Emma", role: "beneficiary" })).toThrow();
expect(propertyContactBody.parse({ external_name: "Emma", role: "beneficiary" }).external_name).toBe("Emma");
expect(() => propertyContactBody.parse({ client_id: clientId, external_email: "copy@example.com", role: "realtor" })).toThrow();
```

Add HTTP integration coverage using the existing admin login pattern:

```ts
it("creates and lists a property without a primary service contact", async () => {
  const created = await apiRequest("POST", "/api/v1/properties", adminCookie, {
    client_id: null,
    address: "469 Cilley Road",
    city: "Manchester",
    state: "NH",
  });
  expect(created.status).toBe(201);
  expect(created.data.data.client_id).toBeNull();

  const listed = await apiRequest("GET", "/api/v1/properties?q=469%20Cilley", adminCookie);
  expect(listed.status).toBe(200);
  expect(listed.data.data.some((row: { id: string }) => row.id === created.data.data.id)).toBe(true);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pnpm --filter @ai-fsm/web test:unit -- contacts.unit.test.ts sponsored
TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_BASE_URL="$TEST_BASE_URL" pnpm --filter @ai-fsm/web test:integration -- properties.integration.test.ts
```

Expected: FAIL because the nullable schema and contact routes/helpers are absent.

- [ ] **Step 3: Make the property API nullable and keep tenant checks**

Change both property schemas to:

```ts
client_id: z.string().uuid().nullable()
```

Only query `clients` when the value is non-null. Change owner list/detail SQL from `JOIN clients` to `LEFT JOIN clients`, use `COALESCE(c.name, 'No primary contact')`, and make TypeScript `client_id` and `client_name` nullable. Search, sort, and group with `COALESCE(c.name, '')` so ownerless rows remain visible.

- [ ] **Step 4: Add account-scoped contact CRUD**

Import one shared body shape from `apps/web/lib/properties/contacts.ts` in both nested routes:

```ts
const propertyContactBody = z.object({
  client_id: z.string().uuid().nullable().optional(),
  external_name: z.string().trim().min(1).max(255).nullable().optional(),
  external_email: z.string().email().max(255).nullable().optional(),
  external_phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  role: z.enum(["owner", "realtor", "beneficiary", "property_manager", "tenant", "other"]),
}).superRefine((value, ctx) => {
  if (Boolean(value.client_id) === Boolean(value.external_name)) {
    ctx.addIssue({ code: "custom", message: "Choose one registered client or one external name" });
  }
  if (value.client_id && (value.external_email || value.external_phone)) {
    ctx.addIssue({ code: "custom", message: "Registered-client contact details come from the client card" });
  }
});
```

Every query must constrain both `property_id` and `account_id`; registered `client_id` must be found in the same account. Map foreign-key restriction on delete to HTTP 409 with `CONTACT_IN_USE`.

Extend the client DELETE dependency query with `property_contacts.client_id` so a registered contact relationship returns the existing 409 dependency response instead of a database error.

- [ ] **Step 5: Add main-property validation to the client PATCH route**

Extend the schema with `primary_property_id: z.string().uuid().nullable().optional()`. Before update, require:

```sql
SELECT id FROM properties
WHERE id = $1 AND account_id = $2 AND client_id = $3
```

Return 422 `VALIDATION_ERROR` when the property is ownerless, cross-account, or primarily served for another client.

- [ ] **Step 6: Update the owner UI without creating a second property workflow**

Make the Property form's primary-service-contact select optional and submit `null` for an empty choice. On list/detail pages render “No primary contact” as text, and show client, job, and estimate links only when `property.client_id` exists.

`PropertyContactsPanel` receives initial rows and registered-client options, then calls the nested APIs for add/edit/delete. It displays external email/phone/notes only in this owner/admin page. `SetMainPropertyButton` appears only when the property has a primary client and PATCHes that client with this property ID.

- [ ] **Step 7: Run typecheck and the focused tests**

Run:

```bash
pnpm --filter @ai-fsm/web test:unit -- contacts.unit.test.ts sponsored
TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_BASE_URL="$TEST_BASE_URL" pnpm --filter @ai-fsm/web test:integration -- properties.integration.test.ts
pnpm --filter @ai-fsm/web typecheck
```

Expected: PASS; no non-null client assumption remains on the modified property pages.

- [ ] **Step 8: Commit the property slice**

```bash
git add apps/web/app/api/v1/properties apps/web/app/api/v1/clients/[id]/route.ts apps/web/app/app/properties apps/web/lib/properties
git commit -m "feat: support property contacts and main homes"
```

### Task 3: Create and Edit Sponsored Invoices

**Files:**
- Create: `apps/web/lib/invoices/sponsored.ts`
- Create: `apps/web/lib/invoices/__tests__/sponsored.unit.test.ts`
- Modify: `apps/web/app/api/v1/invoices/route.ts`
- Modify: `apps/web/app/api/v1/invoices/[id]/route.ts`
- Modify: `apps/web/app/api/v1/invoices/[id]/document-links/route.ts`
- Modify: `apps/web/app/app/invoices/new/page.tsx`
- Modify: `apps/web/app/app/invoices/new/NewInvoiceForm.tsx`
- Modify: `apps/web/app/app/invoices/[id]/page.tsx`
- Modify: `apps/web/app/app/invoices/[id]/InvoiceEditForm.tsx`

**Interfaces:**
- Consumes: property/contact schema from Task 1.
- Produces: `SPONSORED_PURPOSE_LABELS`, `formatSponsoredInvoiceLabel(input)`, and `validateInvoiceContext(client, accountId, input)`.
- Produces: invoice create/PATCH fields matching migration 194 exactly.

- [ ] **Step 1: Write failing unit tests for labels and validation inputs**

```ts
expect(formatSponsoredInvoiceLabel({
  propertyAddress: "469 Cilley Road",
  beneficiaryName: "Client not yet identified",
  workSummary: "Refresh before listing\n• Paint touch-ups",
  invoiceNumber: "0203",
})).toBe("469 Cilley Road — Client not yet identified — Refresh before listing");

expect(formatSponsoredInvoiceLabel({
  propertyAddress: "96 Richardson Road",
  beneficiaryName: "Emma",
  workSummary: null,
  invoiceNumber: "0200",
})).toBe("96 Richardson Road — Emma — Invoice 0200");
```

Add integration/API cases that standard invoices reject another client's property, sponsored invoices accept an account property with its beneficiary, and both reject foreign-account UUIDs.

Use the existing `apiRequest` helper in `invoices.integration.test.ts`:

```ts
it("creates sponsored work only with a beneficiary on the selected property", async () => {
  const ok = await apiRequest("POST", "/api/v1/invoices", adminCookie, {
    client_id: kimId,
    property_id: propertyId,
    billing_context: "realtor_sponsored",
    sponsored_purpose: "pre_listing",
    beneficiary_property_contact_id: beneficiaryId,
    business_purpose: "Prepare the client's home for listing",
    tax_rate: 0,
    line_items: [{ description: "Paint touch-ups", quantity: 1, unit_price_cents: 25000, sort_order: 0 }],
  });
  expect(ok.status).toBe(201);

  const wrongProperty = await apiRequest("POST", "/api/v1/invoices", adminCookie, {
    client_id: kimId,
    property_id: otherPropertyId,
    billing_context: "realtor_sponsored",
    sponsored_purpose: "pre_listing",
    beneficiary_property_contact_id: beneficiaryId,
    tax_rate: 0,
    line_items: [{ description: "Paint touch-ups", quantity: 1, unit_price_cents: 25000, sort_order: 0 }],
  });
  expect(wrongProperty.status).toBe(422);
});
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
pnpm --filter @ai-fsm/web test:unit -- sponsored.unit.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_BASE_URL="$TEST_BASE_URL" pnpm --filter @ai-fsm/web test:integration -- invoices.integration.test.ts
```

Expected: unit FAIL because the helper does not exist; API case FAIL because sponsored fields are not accepted.

- [ ] **Step 3: Implement the shared sponsored helper**

Export exact types and labels:

```ts
export type BillingContext = "standard" | "realtor_sponsored";
export type SponsoredPurpose = "pre_listing" | "inspection_closing" | "staging_appearance" | "client_concierge" | "ongoing_care" | "other";

export const SPONSORED_PURPOSE_LABELS: Record<SponsoredPurpose, string> = {
  pre_listing: "Pre-listing preparation",
  inspection_closing: "Inspection or closing work",
  staging_appearance: "Staging and appearance",
  client_concierge: "Client concierge",
  ongoing_care: "Ongoing property care",
  other: "Other realtor-sponsored work",
};
```

`validateInvoiceContext` must verify payer, optional job, and property account membership. For `standard`, a selected property must have `client_id = payerClientId`. For `realtor_sponsored`, require an explicit account property and a beneficiary contact on that exact property; do not require the payer to be a property contact.

- [ ] **Step 4: Extend invoice POST and draft PATCH**

Add this Zod shape to both create and draft-edit inputs:

```ts
billing_context: z.enum(["standard", "realtor_sponsored"]).default("standard"),
sponsored_purpose: sponsoredPurposeSchema.nullable().optional(),
beneficiary_property_contact_id: z.string().uuid().nullable().optional(),
business_purpose: z.string().trim().max(2000).nullable().optional(),
```

Call `validateInvoiceContext` before inserting/updating. Map its `NOT_FOUND` to 404 and `VALIDATION_ERROR` to 422. Include the fields in audit records. In the document-link correction route, validate the resulting property against the invoice's existing billing context and beneficiary before UPDATE.

- [ ] **Step 5: Add the minimal owner form controls**

Load all account properties plus contact display names on the new-invoice page. Standard mode retains client-filtered properties. Sponsored mode shows all account properties and requires:

```tsx
<Select label="Billing context" options={[
  { value: "standard", label: "Standard customer work" },
  { value: "realtor_sponsored", label: "Realtor-sponsored property work" },
]} />
```

When sponsored, show Service property, Work for, Sponsored purpose, and Business-purpose note. Filter beneficiary options to the selected property's contacts. Reuse the same controls in `InvoiceEditForm` for drafts; do not render edit controls for sent or paid invoices.

- [ ] **Step 6: Show frozen sponsored facts on the owner invoice detail**

Join the selected property contact and its registered client, derive `beneficiary_name = COALESCE(contact_client.name, pc.external_name)`, and render context, beneficiary, purpose label, property, and business purpose in the existing details card.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
pnpm --filter @ai-fsm/web test:unit -- sponsored.unit.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" TEST_BASE_URL="$TEST_BASE_URL" pnpm --filter @ai-fsm/web test:integration -- invoices.integration.test.ts
pnpm --filter @ai-fsm/web typecheck
```

Expected: PASS, including standard-property and cross-account regressions.

- [ ] **Step 8: Commit the invoice workflow slice**

```bash
git add apps/web/lib/invoices/sponsored.ts apps/web/lib/invoices/__tests__/sponsored.unit.test.ts apps/web/app/api/v1/invoices apps/web/app/app/invoices
git commit -m "feat: create realtor-sponsored invoices"
```

### Task 4: Enforce Payer-Only Portal Visibility

**Files:**
- Create: `apps/web/lib/portal/sponsored-invoices.ts`
- Create: `apps/web/lib/portal/__tests__/sponsored-invoices.integration.test.ts`
- Modify: `apps/web/app/portal/[clientToken]/page.tsx`

**Interfaces:**
- Consumes: authenticated `client.id` from `getPortalSession()` and sponsored invoice fields.
- Produces: `loadSponsoredInvoices(queryable, clientId)` with a deliberately minimal return type.

- [ ] **Step 1: Write the failing authorization integration test**

Seed Peter as the primary contact on 4 Ash, Kim as a realtor contact, one sponsored invoice billed to Kim, and one unrelated invoice billed to Peter. Assert:

```ts
const kimRows = await loadSponsoredInvoices(client, kimId);
expect(kimRows.map((row) => row.invoice_number)).toEqual(["KIM-4ASH"]);
expect(kimRows[0]).not.toHaveProperty("property_notes");
expect(kimRows[0]).not.toHaveProperty("beneficiary_email");

const peterRows = await loadSponsoredInvoices(client, peterId);
expect(peterRows.map((row) => row.invoice_number)).not.toContain("KIM-4ASH");

const realtorOnlyRows = await loadSponsoredInvoices(client, unrelatedRealtorId);
expect(realtorOnlyRows).toEqual([]);
```

- [ ] **Step 2: Run it and confirm failure**

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-fsm/web test:integration -- sponsored-invoices.integration.test.ts
```

Expected: FAIL because the loader is absent.

- [ ] **Step 3: Implement the minimal portal query**

The SQL boundary must be visible in one place:

```sql
SELECT i.id, i.invoice_number, i.status, i.total_cents, i.paid_cents,
       i.due_date, i.paid_at, i.share_token, i.sponsored_purpose,
       i.business_purpose, i.work_summary,
       p.name AS property_name, p.address AS property_address,
       COALESCE(contact_client.name, pc.external_name) AS beneficiary_name
FROM invoices i
JOIN properties p ON p.id = i.property_id AND p.account_id = i.account_id
JOIN property_contacts pc ON pc.id = i.beneficiary_property_contact_id
LEFT JOIN clients contact_client ON contact_client.id = pc.client_id
WHERE i.client_id = $1
  AND i.billing_context = 'realtor_sponsored'
  AND i.status <> 'draft'
ORDER BY i.created_at DESC
```

The return interface must contain only the selected columns. Never join property notes, jobs, estimates, visits, vault tables, contact email/phone, or payments.

- [ ] **Step 4: Split standard invoices from Sponsored Work in the portal**

Change the existing normal invoice query to `billing_context = 'standard'`. Load sponsored rows through `loadSponsoredInvoices`. Render a separate **Sponsored Work** section grouped visually by property/beneficiary, with descriptive label, purpose, total, status, paid date, and the existing share-token invoice link. Include sponsored open balances in the top amount owed and stage calculation without adding the rows to My Properties.

- [ ] **Step 5: Run authorization tests and typecheck**

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-fsm/web test:integration -- sponsored-invoices.integration.test.ts
pnpm --filter @ai-fsm/web typecheck
```

Expected: PASS; Kim's query returns her billed invoice, Peter and relationship-only realtors do not.

- [ ] **Step 6: Commit the portal slice**

```bash
git add apps/web/lib/portal/sponsored-invoices.ts apps/web/lib/portal/__tests__/sponsored-invoices.integration.test.ts apps/web/app/portal/[clientToken]/page.tsx
git commit -m "feat: add payer-only sponsored work portal"
```

### Task 5: Render Descriptive PDFs, Lists, Portal Invoice, and Exports

**Files:**
- Modify: `apps/web/lib/documents/service-location.ts`
- Modify: `apps/web/lib/documents/__tests__/service-location.unit.test.ts`
- Modify: `apps/web/lib/pdf/document-pdf.ts`
- Modify: `apps/web/lib/pdf/load.ts`
- Modify: `apps/web/lib/pdf/__tests__/document-pdf.unit.test.ts`
- Modify: `apps/web/app/app/invoices/[id]/print/page.tsx`
- Modify: `apps/web/app/api/portal/invoices/[token]/route.ts`
- Modify: `apps/web/app/portal/invoices/[token]/InvoicePortalClient.tsx`
- Modify: `apps/web/app/app/invoices/page.tsx`
- Modify: `apps/web/app/api/v1/invoices/route.ts`
- Modify: `apps/web/lib/reports/export.ts`
- Modify: `apps/web/lib/reports/__tests__/export.unit.test.ts`
- Modify: `apps/web/app/api/v1/reports/month-end-export/route.ts`

**Interfaces:**
- Consumes: `SPONSORED_PURPOSE_LABELS` and `formatSponsoredInvoiceLabel` from Task 3.
- Produces: matching PDF/print/web bookkeeping fields and CSV columns.

- [ ] **Step 1: Add failing PDF, fallback, and CSV tests**

Extend `InvoicePdfData` test input with:

```ts
sponsored: {
  paidBy: "Kimberley Tufts",
  beneficiary: "Emma",
  category: "Realtor-sponsored property expense",
  purpose: "Other realtor-sponsored work",
  businessPurpose: "Client property preparation",
}
```

Assert extracted PDF text contains `PAID`, the paid date, `Paid by`, `Kimberley Tufts`, `Work for`, `Emma`, the service address, purpose, and `$0.00` balance. Add a service-location SQL assertion for `c.primary_property_id` preceding the oldest-property fallback. Add a CSV assertion for the exact new headers and escaped business-purpose text.

- [ ] **Step 2: Run the focused unit tests and confirm failure**

```bash
pnpm --filter @ai-fsm/web test:unit -- document-pdf.unit.test.ts service-location.unit.test.ts export.unit.test.ts
```

Expected: FAIL because sponsored render data and CSV fields are absent.

- [ ] **Step 3: Prefer explicit main property in document fallback**

In `documentJoins`, retain explicit invoice, job, and estimate property priority, then use:

```sql
COALESCE(c.primary_property_id, (
  SELECT p2.id FROM properties p2
  WHERE p2.client_id = c.id AND p2.account_id = root.account_id
  ORDER BY p2.created_at ASC LIMIT 1
))
```

Existing documents with explicit property links remain unchanged.

- [ ] **Step 4: Add one sponsored block to the shared PDF renderer**

Extend `InvoicePdfData` and `RenderInput` with one optional `sponsored` object. After Bill To and Service Location, render a compact section only when present:

```text
REALTOR-SPONSORED PROPERTY EXPENSE
Paid by: Kimberley Tufts
Work for: Emma
Purpose: Other realtor-sponsored work
Business purpose: Client property preparation
```

Join the beneficiary display name and invoice fields in `loadInvoicePdf`, map purpose through the shared labels, and keep the existing paid-stamp and balance calculations unchanged.

- [ ] **Step 5: Match HTML print and public single-invoice views**

Select the same fields in the print page and share-token invoice API. Render the same labels in `InvoicePrintPage` and `InvoicePortalClient`. Do not include external contact email, phone, notes, property history, or other invoices.

- [ ] **Step 6: Use descriptive labels in owner lists and API rows**

Select property address, beneficiary display name, work summary, and billing context in both owner invoice list paths. For sponsored rows render `formatSponsoredInvoiceLabel`; standard rows keep their current invoice number/client presentation.

- [ ] **Step 7: Extend the existing invoice CSV**

Add columns after Client:

```ts
"Billing Context", "Service Property", "Work For", "Sponsored Purpose", "Business Purpose", "Work Summary", "Paid Date"
```

Join properties and beneficiary contacts in `month-end-export`. Standard rows leave sponsored columns empty. Reuse the existing CSV escaping and date formatters.

- [ ] **Step 8: Run the focused tests, all web unit tests, and typecheck**

```bash
pnpm --filter @ai-fsm/web test:unit -- document-pdf.unit.test.ts service-location.unit.test.ts export.unit.test.ts sponsored.unit.test.ts
pnpm --filter @ai-fsm/web test:unit
pnpm --filter @ai-fsm/web typecheck
```

Expected: PASS; the paid sponsored PDF shows the exact context and zero balance.

- [ ] **Step 9: Commit the presentation slice**

```bash
git add apps/web/lib/documents apps/web/lib/pdf apps/web/app/app/invoices apps/web/app/api/v1/invoices/route.ts apps/web/app/api/portal/invoices apps/web/app/portal/invoices apps/web/lib/reports apps/web/app/api/v1/reports/month-end-export/route.ts
git commit -m "feat: describe sponsored work in records"
```

### Task 6: Prepare and Dry-Run Kim's Idempotent Data Patch

**Files:**
- Create: `/home/nick/Kim-Tufts-Invoices/link-sponsored-work.sql`
- Create: `/home/nick/Kim-Tufts-Invoices/verify-sponsored-work.sql`
- Modify: `/home/nick/Kim-Tufts-Invoices/README.md`

**Interfaces:**
- Consumes: production account `aaaaaaaa-0000-0000-0000-000000000001`, Kim client `92f94b44-bf5d-4eec-b504-394121899b2c`, existing 187 Webhannet property `bc521caa-45ca-4edc-b8e0-fe76f2794207`, invoice numbers `0200` and `0203`, and the exact 13-invoice manifest already in the archive.
- Produces: no duplicate property/contact/invoice/PDF rows; main property and known sponsored links only.

- [ ] **Step 1: Write the guarded patch in the invoice archive**

The transaction must first assert Kim's client/email, the 13 invoice count, total and paid sums of `1625009`, exact totals `0200 = 30970` and `0203 = 310545`, their paid status/dates, the existing Webhannet ID, and exactly one Peter-linked 4 Ash property in Salem.

Use normalized address lookups plus `INSERT ... SELECT ... WHERE NOT EXISTS` for:

```text
1568 Lake Shore Road, Manchester, NH 03109 — primary Kim property
96 Richardson Road, North Chelmsford — no primary contact
469 Cilley Road, Manchester, NH — no primary contact
```

Upsert property contacts by property, identity, and role:

```text
96 Richardson: Emma (external beneficiary), Kim (registered realtor)
469 Cilley: Client not yet identified (external beneficiary), Kim (registered realtor)
4 Ash, Salem: Kim (registered realtor); Peter remains primary service contact
```

Set Kim's `primary_property_id` to 1568 Lake Shore. Update only invoice `0200` to 96 Richardson/Emma and invoice `0203` to 469 Cilley/placeholder with `billing_context = 'realtor_sponsored'`, `sponsored_purpose = 'other'`, and clear factual business-purpose notes. Leave all other historical invoice associations unchanged.

Those two invoices are already paid and normally immutable. After all guards pass, take an `ACCESS EXCLUSIVE` lock and disable only the existing immutability trigger for the two exact updates; leave the sponsored-context validation trigger enabled. Re-enable it before commit. Because the DDL is inside the transaction, any failure rolls the trigger state back:

```sql
LOCK TABLE invoices IN ACCESS EXCLUSIVE MODE;
ALTER TABLE invoices DISABLE TRIGGER trg_invoices_immutability;

UPDATE invoices i
SET billing_context = 'realtor_sponsored',
    property_id = links.property_id,
    beneficiary_property_contact_id = links.contact_id,
    sponsored_purpose = 'other',
    business_purpose = links.business_purpose
FROM kim_sponsored_links links
WHERE i.account_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  AND i.client_id = '92f94b44-bf5d-4eec-b504-394121899b2c'
  AND i.invoice_number = links.invoice_number;

ALTER TABLE invoices ENABLE TRIGGER trg_invoices_immutability;
```

Build temporary `kim_sponsored_links(invoice_number, property_id, contact_id, business_purpose)` from the exact resolved 0200/0203 rows immediately before the update, with factual notes “Client property repair paid by realtor” and “Client property refresh paid by realtor.” Assert the UPDATE affected exactly two rows and query `pg_trigger.tgenabled = 'O'` for `trg_invoices_immutability` before commit.

- [ ] **Step 2: Write independent postcondition SQL**

`verify-sponsored-work.sql` must raise on any violation and finish with a human-readable table. Assert:

```sql
-- Exactly one of each new address, one relationship of each requested role,
-- Kim main = Lake Shore, Peter still primary at 4 Ash, 13 invoices still total
-- and paid to 1625009, no duplicate invoice number, 0200/0203 point to their
-- exact beneficiary/property, and no other Kim invoice became sponsored.
```

- [ ] **Step 3: Run both scripts against a disposable production snapshot**

Apply migration 194 and the patch twice to a restored snapshot, then run verification:

```bash
psql "$SNAPSHOT_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/194_realtor_sponsored_property_work.sql
psql "$SNAPSHOT_DATABASE_URL" -v ON_ERROR_STOP=1 -f /home/nick/Kim-Tufts-Invoices/link-sponsored-work.sql
psql "$SNAPSHOT_DATABASE_URL" -v ON_ERROR_STOP=1 -f /home/nick/Kim-Tufts-Invoices/link-sponsored-work.sql
psql "$SNAPSHOT_DATABASE_URL" -v ON_ERROR_STOP=1 -f /home/nick/Kim-Tufts-Invoices/verify-sponsored-work.sql
```

Expected: both applications succeed; verification reports three requested properties, five requested relationships, two sponsored invoices, 13 paid invoices, and $16,250.09 total.

- [ ] **Step 4: Update the archive README with the prepared migration state**

Record the new property/contact associations, the two sponsored invoice numbers, the main property, dry-run date, and the fact that production and Drive remain unchanged until Task 7 approval.

### Task 7: Whole-Branch Verification, Review, and Gated Production Rollout

**Files:**
- Modify: `docs/backlog/TASK-158-realtor-sponsored-properties.md`
- Verify: all files listed above.

**Interfaces:**
- Consumes: all prior tasks and the prepared Kim patch.
- Produces: a reviewed branch; production migration/data/PDF changes only after explicit deployment approval.

- [ ] **Step 1: Run the repository gates**

```bash
pnpm gate:fast
pnpm --filter @ai-fsm/web test:unit
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @ai-fsm/web test:integration -- sponsored.integration.test.ts sponsored-invoices.integration.test.ts work-summary-itemized.integration.test.ts
git diff --check origin/main...HEAD
```

Expected: all commands PASS. If an unrelated pre-existing check fails, capture the exact failure and prove whether this branch changed its path.

- [ ] **Step 2: Perform the required security review**

Inspect every customer-facing SQL query and verify:

```text
normal property access => properties.client_id = logged-in client
sponsored list access => invoices.client_id = logged-in client
realtor contact alone => no access path
primary property contact => no access to another payer's invoice/payment
share-token invoice => one invoice only; no contact notes or property history
```

Search for every read of `beneficiary_property_contact_id`, `billing_context`, and `property_contacts` and confirm account/property predicates are present.

- [ ] **Step 3: Update TASK-158 evidence and commit**

Mark acceptance criteria complete only for verified behavior and add the commands/results. Then:

```bash
git add docs/backlog/TASK-158-realtor-sponsored-properties.md
git commit -m "docs: record sponsored work verification"
```

- [ ] **Step 4: Run a fresh whole-branch code review**

Use `superpowers:requesting-code-review` on `origin/main...HEAD`. Resolve correctness or security findings, rerun the affected checks, and commit fixes separately.

- [ ] **Step 5: Stop for explicit production deployment approval**

Present the passing evidence, reviewed commits, migration 194, the exact Kim patch effects, and the Drive folder target. Do not deploy, mutate production, regenerate production PDFs, or replace Drive bytes until the user explicitly approves this rollout.

- [ ] **Step 6: Deploy application and migration after approval**

Use the repository's existing deployment path, confirm migration 194 is applied, and smoke-test ownerless property creation, contact creation, sponsored draft creation, payer portal visibility, and denial for a relationship-only client before applying Kim's data patch.

- [ ] **Step 7: Apply and verify Kim's production patch**

Run `link-sponsored-work.sql` once and `verify-sponsored-work.sql` afterward. Query the portal projection as Kim, Peter, and a relationship-only client. Expected: Kim sees only invoices billed to her; Peter does not see Kim's financial rows; realtor linkage alone returns none.

- [ ] **Step 8: Regenerate and replace the 13 PDFs in place**

Reuse `/home/nick/Kim-Tufts-Invoices/download-ai-fsm-pdfs.cjs` to download one current PDF for each manifest invoice. Extract text to verify invoice number, total, paid stamp/date, and zero balance; additionally verify 0200 contains 96 Richardson/Emma and 0203 contains 469 Cilley/Client not yet identified.

Using the connected Google Drive account, replace bytes for the existing 13 files in folder `1H1wi_ITH4sYB1LqfrF0E7Kf7_LQOV-AI`. Preserve file IDs and names; create no new Drive files. Read the folder back and assert exactly 13 PDFs and no duplicate invoice number.

- [ ] **Step 9: Record final production evidence**

Update `/home/nick/Kim-Tufts-Invoices/README.md` with deployment time, verification result, PDF hash/readback result, and Drive file count. Report the two sponsored mappings, Kim's main property, 4 Ash's unchanged Peter primary relationship, and the strict payer-only portal result.
