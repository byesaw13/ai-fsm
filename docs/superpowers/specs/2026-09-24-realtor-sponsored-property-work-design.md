# Realtor-Sponsored Property Work Design

Date: 2026-09-24
Task: TASK-158
Phase: 2
Status: approved conversational design; written review pending

## Purpose

Represent work that one person pays for at another person's property without
duplicating the property or exposing the property's private record. The first
case is realtor Kimberley Tufts paying Dovetails for work performed for her
clients.

Success means:

- The bill and receipt make the property, beneficiary, purpose, work, amount,
  and paid date easy to distinguish.
- Kim can review and export only work billed to her.
- A realtor link alone reveals no property history, vault data, photos,
  estimates, jobs, or other invoices.
- A house such as 4 Ash stays one property with Peter as primary service
  contact and Kim as a non-owning realtor contact.
- Properties with only a lightweight external contact do not require a fake
  AI-FSM client card.

## Domain Decisions

### Property and contacts

`properties.client_id` becomes nullable. When set, it means **primary service
contact**, not legal owner. Existing properties retain their current client.

Add `property_contacts` for secondary relationships:

- `account_id`, `property_id`
- either `client_id` for an existing AI-FSM client or an external `name`
- optional external `email`, `phone`, and private `notes`
- `role`: `owner`, `realtor`, `beneficiary`, `property_manager`, `tenant`, or
  `other`

Exactly one identity is required: either `client_id` or a nonblank external
`name`, never both. Foreign keys use delete-restrict for contacts referenced by
an invoice so historical bill and receipt labels cannot silently change.

The table stores relationships, not a second property or a second copy of an
existing client's contact fields. When `client_id` is set, display name and
contact details come from `clients`.

Add nullable `clients.primary_property_id`. A partial unique constraint is not
needed because the pointer itself permits only one main property per client.
The referenced property must belong to the same account and have that client as
its primary service contact; the API validates this boundary.

### Invoice payer and sponsored context

Keep `invoices.client_id` as the bill-to client and payer. Add nullable fields:

- `billing_context`: `standard` or `realtor_sponsored`, default `standard`
- `sponsored_purpose`: `pre_listing`, `inspection_closing`,
  `staging_appearance`, `client_concierge`, `ongoing_care`, or `other`
- `beneficiary_property_contact_id`
- `business_purpose`

A sponsored invoice requires an explicit `property_id`, a beneficiary contact,
and a sponsored purpose. The beneficiary contact must belong to the selected
property. The payer may differ from the property's primary service contact.

No new invoice title column is needed. Lists and PDFs derive a descriptive
label from existing facts:

`<short property address> — <beneficiary> — <first work-summary line>`

## Access Rules

The relationship role never grants access. Access remains explicit:

1. The normal customer property portal returns a property only when the logged
   in client is its primary service contact.
2. The sponsored-work portal returns invoices only when
   `invoice.client_id = logged_in_client_id` and
   `billing_context = 'realtor_sponsored'`.
3. That view returns only invoice fields, payment fields, beneficiary display
   name, and the property's name/address.
4. It never returns property notes, vault records, photos, estimates, jobs,
   visits, other invoices, or another person's contact details.
5. Customer-facing property history excludes invoice/payment rows whose
   bill-to client differs from the logged-in client.
6. Owner/admin internal views remain account-scoped and can see the complete
   operational record.

Kim therefore sees “Your sponsored work at 4 Ash,” never Peter's full 4 Ash
property card. This access comes from Kim being the invoice payer, not from the
realtor relationship. Peter does not see Kim's invoice amounts or payment
details.

## Owner Workflow

Property create/edit supports an optional primary service contact. The property
detail page manages lightweight contacts with role and private notes. Adding a
registered person as realtor does not change portal permissions.

Invoice create/edit keeps “Bill to” first. Selecting “Realtor-sponsored
property work” reveals:

- Service property, including properties outside the payer's primary list
- Work for / beneficiary
- Sponsored purpose
- Business-purpose note

Server validation—not UI filtering—enforces account ownership and relationship
consistency. Sent and paid invoices keep the existing immutability rules.

## Customer Portal, PDF, and Export

Kim's portal gains a **Sponsored work** section grouped by property and
beneficiary. Each row shows service date, descriptive label, purpose, total,
status, paid date, and the existing invoice/PDF link.

Sponsored PDFs add a compact section below Bill To and Service Location:

- Paid by
- Work for
- Category: Realtor-sponsored property expense
- Purpose
- Business-purpose note when present

The invoice list/report export includes the same fields. It is a bookkeeping
record, not tax advice; final tax classification remains the customer's and
their tax professional's decision.

## Historical Kim Migration

The production data patch is a separate idempotent transaction after the code
deploy. It sends no email and creates no charge.

- Create `1568 Lake Shore Road, Manchester, NH 03109` with Kim as primary
  service contact and set it as her main property.
- Keep `187 Webhannet Drive, Wells, ME 04090` linked to Kim but not main.
- Create `96 Richardson Road, North Chelmsford` without a primary service
  contact; add external beneficiary `Emma` and Kim as realtor; link invoice
  `0200` as sponsored purpose `other` until a more specific purpose is known.
- Create `469 Cilley Road, Manchester, NH` without a primary service contact;
  add external beneficiary `Client not yet identified` and Kim as realtor;
  link invoice `0203` as sponsored purpose `other`.
- At existing 4 Ash in Salem, keep Peter as primary service contact and add Kim
  as realtor. Do not expose the property to Kim until an invoice billed to Kim
  is linked there.
- Leave invoices without reliable property or beneficiary evidence unchanged;
  do not invent associations.
- Improve known historical work summaries, regenerate the 13 PDFs, and replace
  the existing Drive PDF bytes in place so Drive file IDs and one-file-per-bill
  organization remain intact.

Before commit, the data patch asserts exact clients, addresses, invoice
numbers, totals, and payment dates. After commit it asserts no duplicates and
that every migrated sponsored invoice is visible to Kim but absent from every
other customer's sponsored-invoice query.

## Failure Handling

- Reject cross-account property, contact, beneficiary, or invoice references.
- Reject a sponsored invoice with missing property, beneficiary, or purpose.
- Reject a beneficiary from a different property.
- Reject deletion of any contact referenced by an invoice. Correct its label or
  remove the draft invoice reference first; sent and paid history stays intact.
- Missing optional external contact details render the contact name only.
- The migration and production data patch are transactional and idempotent.

## Testing

- Migration integration test: nullable property primary contact, contact
  constraints, account boundaries, and client main-property validation.
- Invoice API tests: valid sponsored draft, missing required fields, wrong
  property contact, and cross-account rejection.
- Portal authorization tests: payer allowed; realtor-without-billing denied;
  primary property contact denied another payer's financial record.
- PDF unit test: paid sponsored invoice renders payer, beneficiary, property,
  purpose, paid stamp, and zero balance.
- UI unit tests for derived descriptive labels and purpose labels.
- Historical patch dry run, apply, idempotency rerun, database postconditions,
  PDF text extraction, and Drive folder readback.

## Non-Goals

- Realtor lead routing, commissions, referral marketplaces, shared vaults, or
  permission invitations
- Creating full client cards or portals for lightweight beneficiary contacts
- Automated tax treatment or tax-deduction claims
- Rewriting unknown historical facts
