# TASK-221: Materials checklists per job type (ask before you buy)

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3 (estimating slice; see ROADMAP Phase 3 bullet "TASK-221 materials checklists")

Owner approval:
Design approved 2026-10-29 (`docs/designs/job-materials-checklists.md`). **Build not yet approved.**
It needs three new tables and one new column, so it needs a table-freeze exception from the owner
before build, the way TASK-218 had one.

Depends on:
- TASK-220 (price book refresh), for the codes the checklists hang on and for
  `estimate_line_items.price_book_id` being filled in.
- TASK-218 reference lines (their "includes" text seeds AI-drafted checklists).

Problem:
Every kind of job comes in variants: a dimmer is single-pole, 3-way or 4-way; a toilet may need a new
supply line and shut-off; a bath fan may need a roof cap or a wall hood. The job buy list doesn't ask,
so parts get missed, and a missed part means a second store trip in the middle of the job. Only 5 of
115 codes have a parts list today, and those lists are fixed.

Scope (from the approved design):
- **Checklist per code:** short questions with choices and defaults. Each choice turns on kit rows
  (`price_book_material_templates`). Only questions that can cause a wrong or missing part.
- **Answers per unit of work** on the estimate, carried to the job; the job buy list build expands
  once per unit and sums the parts.
- **AI pre-fill** of answers the notes state; uncertain answers are left blank, never guessed.
- **AI-drafted checklists** for codes with none, from the Craftsman reference and the owner's
  receipts; used only after the owner approves.
- **"Still to decide"** on the job buy list for unanswered questions.
- **Changing an answer** rebuilds only `needed` lines from that unit; bought or on-truck lines are kept
  and flagged.
- First checklists: the owner's 15 most-done jobs (from the TASK-220 history review), starting with
  three written from the owner's own list of past store-trip misses.

Out of scope:
- The "what did we forget?" log (receipt-to-list matching). Separate design later.
- A multi-job day buy list.
- The Phase 4 "Material Assemblies platform": no catalog-wide assemblies, no quantity engine beyond
  the existing kit expander, no pricing from checklists.

Acceptance criteria:
- [ ] Owner approves the table-freeze exception and the ROADMAP bullet is marked approved.
- [ ] The 5 existing kits build exactly as before (regression test).
- [ ] A dimmer job with 2 single-pole and 1 three-way answers produces the right parts and counts.
- [ ] Hidden questions select nothing; changed answers rebuild only `needed` lines.
- [ ] An AI-drafted checklist is not used on a buy list until approved.
- [ ] Owner runs one real job from checklists and reports whether anything was missed.

Test plan:
- Unit tests on the expander (choices, hidden questions, per-unit sums).
- Integration tests on the build route and answer changes.
- Design doc: `docs/designs/job-materials-checklists.md`.
