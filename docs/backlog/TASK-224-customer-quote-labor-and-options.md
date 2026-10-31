# TASK-224: Customer quote shows labor as an amount and options that stand out

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (ROADMAP Phase 3 slice "customer quote presentation and letterhead", owner 2026-10-31)

Owner decisions (session 2026-10-31, Angela Dowd quote EST-2026-0026):
- "the customer should not see the hourly on there end it should be labor"
- "we should have the son's room option 2 maybe it's a line under it stating the differece in scope and price"
- "we should add it as an option clearly addressed so she understands what we are talking about"
- "I also need options on the estimate to standout more"

Problem:
- Customer views of a quote show hours and the hourly rate. A prepared T&M labor line reads
  "Living room — labor, est. 13–19.25 h" with Qty 16.25 and Unit price $85.00. The portal, the PDF and
  the print page all show the Qty and Unit price columns.
- Options on a prepared quote (`prepared_scope.alternatives`) have no price. They print as plain bullets
  inside the notes text, so they look like the rest of the scope. Each option's `note` (why to pick it)
  is stored but never printed.
- The owner has no way to give an option a price, write its note, add an option, or remove one. On
  2026-10-31 the Dowd options were added with a data script, with the price typed into the label.
- A fixed-price quote still prints "Materials are allowances. The final cost follows the products
  chosen." That contradicts the fixed price.

Scope:
- Customer views (portal `/portal/estimates/[token]`, the PDF from `lib/pdf/document-pdf.ts`, and the
  print page `/app/estimates/[id]/print`). A `labor` line shows its description and amount only. Qty and
  Unit price are blank for labor lines. Other line types keep their columns.
- Prepared T&M labor descriptions drop the hours: "Living room — labor". The hours stay in
  `hours_low` / `hours_high` for staff views. The T&M pricing sentence (a dollar range) stays.
- `PreparedAlternative` gets an optional `price_cents` (integer ≥ 0, null = no price yet). Old scopes
  without the field still parse.
- An "Optional add-ons" block on all three customer views, after the totals:
  - Each option shows its label, its note, and "+$750" when it has a price.
  - The block says "Not included in the total above."
  - It is visually distinct: an accent border and tinted background, not plain text. It follows
    `docs/working/ux-implementation-direction.md`.
- `buildProposalNotes` no longer writes the "Options (not included…)" section when the scope has
  alternatives, because the block replaces it. Without alternatives, unconfirmed tasks are still
  listed as before.
- Fixed-price quotes do not print the allowances sentence.
- PreparedScopePanel, owner only, drafts only:
  - edit each option's label, price and note
  - add an option (label required)
  - remove an option
  - Save persists these through `applyScopeEdits`. The server assigns ids for new options; incoming
    `task_ids` are ignored for new options. Apply rebuilds the notes.

Out of scope:
- The customer choosing add-ons when approving. That is TASK-225.
- Invoices. Hours on T&M invoices are actuals and are unchanged.
- Manual (non-prepared) quotes get the labor-column change only. They have no alternatives.

Acceptance Criteria:
- [ ] The portal, PDF and print page of a quote with a labor line show no Qty, Unit price or hours for
      that line. Unit tests cover the PDF rows and the notes builder. A render test covers the portal row.
- [ ] Prepared T&M Apply writes "<Area> — labor" descriptions with the hours in hours_low/hours_high.
- [ ] A prepared quote with two priced options shows the add-ons block on all three views, with the
      label, note and "+$X", and the totals do not change.
- [ ] Notes no longer duplicate the options when alternatives exist.
- [ ] A fixed-price quote prints no allowances sentence.
- [ ] The owner can add, edit and remove an option and save it. An integration test covers the
      prepared-scope PUT with a new option and a changed price.
- [ ] Dowd EST-2026-0026 is migrated: the prices in its option labels move to `price_cents`, and its
      notes are rebuilt. Dry run first, no total change. This happens after the deploy is verified.

Related:
TASK-223 (PR 2's customer-view bullet now points here), TASK-225, TASK-200.

Effort:
1 d
