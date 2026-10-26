# TASK-179: Prepare Quote from the saved assessment

Status:
Done (#712, #713 and slice 3, 2026-10-24)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Problem:
The T&M briefing path (`lib/estimates/tm-briefing.ts`,
`api/v1/estimates/ai-tm-briefing`, `TmDraftReviewPanel.tsx`) already extracts
scope, labor hour ranges, materials with supplier responsibility, risks and
drying/trip flags, and prices from account settings. But it reads only the
job's title, notes and property, not the saved assessment. Hours are one
range for the whole job. Scope items are plain strings with no room. On save
the extraction is flattened into notes text (`useEstimateForm.ts`), so
assumptions and questions do not survive a reload. The separate AI draft
prompt caps a draft at six services (`ai-draft.ts`).

Business Value:
One button turns a walkthrough into a usable draft without retyping it.

Scope:
- One Prepare Quote action on the assessment. It saves first, then builds the
  draft server-side from the saved rooms, notes and photos. Extend the T&M
  briefing path; do not create a second estimate engine.
- Reuse T&M preparation, not T&M billing. The saved scope must also be able
  to feed a fixed-price proposal (TASK-180).
- Every requested action is kept with its room. Grouping several actions into
  one customer line is allowed; dropping one is not. Remove the six-service
  cap. If any limit is hit, show it.
- Separate a field observation, a customer request and an AI-suggested
  addition. Never silently add whole-room painting, subfloor replacement or
  fixture upgrades.
- Quantities are calculated in code from the measurements, never by the
  model, and attach to the task they drive (bathroom ceiling paint → 96 sq ft;
  Room 1 baseboard → 2 LF). Use the shared geometry helper in
  `packages/domain`. Mark each as measured, assumed or overridden. An unknown
  dimension leaves the quantity unknown, never zero or a default.
- Hours low–high and a materials allowance per group, labeled as editable
  suggestions with their source. Starting points, in order: matching
  price-book `labor_hours_low/typical/high`; existing production rates
  (migration 090) applied to measured quantities; otherwise a labeled AI
  allowance. The owner never has to supply hours.
- A draft appears immediately. Questions are attached to the items they
  affect and only cover things that change price or scope. Answers already in
  the notes are not asked again.
- The structured result (tasks, rooms, ranges, assumptions, questions,
  alternatives, answers) is saved on the estimate and reloads intact.
- One open draft per assessment visit. Pressing again opens that draft, does
  not duplicate it, and keeps owner edits. A second version is made by
  copying the draft.
- The draft opens on the existing estimate page (`estimates/[id]`), not the
  new-estimate wizard. A Prepared scope section sits above the summary card:
  tasks by room, quantities with their source, editable hours and materials,
  questions beside the items they affect.
- Apply to quote rebuilds customer line items, one per group, through the
  existing compute path. Each generated line records the group that made it.
  Lines the owner adds by hand are never changed or removed by Apply or by
  regenerating. In the edit form, generated lines are marked "from prepared
  scope" and are edited in the Prepared scope section. Other edit-form fields
  work as today.
- After the estimate is sent, the section is read-only. Estimates without a
  prepared scope show no section and behave as today.
- With the AI unavailable, no draft is created and the owner is told why
  (changed 2026-10-26, see the note at the end).
- Typed notes work with phone keyboard dictation; custom audio capture is not
  required.

Out of Scope:
- Market price comparison, schedule modeling, a catalog-wide production-rate
  project.

Acceptance Criteria:
- [x] The reference notes produce every named task in the right room without
      hand-written estimate lines.
- [x] Known quantities match the reference; unknown height, product details
      and subfloor condition stay unknown.
- [x] The four recorded answers are kept and not asked again.
- [x] With hours removed from the notes, the draft still proposes hour ranges
      with visible sources for the owner to correct. Supplying hours manually
      is not required.
- [x] Save and reload keep tasks, assumptions, questions and alternatives.
- [x] Regenerating does not duplicate the estimate or overwrite owner edits.
- [x] A second Prepare Quote on the same visit opens the existing draft.
- [x] Apply to quote leaves hand-added lines unchanged.
- [x] An estimate without a prepared scope renders and saves exactly as
      before.
- [x] With the AI off, rooms and quantities still reach a draft.

Notes:
Depends on TASK-178. Milestone 1 of the assessment-to-quote assistant.
Shipped in three slices: prepared-scope types and migration 204 (#712); the
Prepare Quote route and shared `createEstimate` (#713); the Prepare Quote
button with a progress line, the Prepared scope section on the estimate page,
and Apply to quote (`PUT /api/v1/estimates/[id]/prepared-scope`). Slice 3 also
fixed the estimate edit form dropping line type, visibility, price-book link
and group on save (every line came back as labor).
Follow-ups not in this task: production rates as a starting-hours source; the
server-side refusal fallback (needs a newer Anthropic SDK).
Data change (additive, reversible migration): `estimates.source_visit_id`,
`estimates.prepared_scope` (jsonb), a unique index on account and source visit
for draft estimates, and a nullable group key on `estimate_line_items` marking
lines produced by Apply to quote. Owner decisions 2026-10-23: existing estimate
page; one draft per visit.

Owner decision 2026-10-26: when the AI cannot run (account out of credit, key
missing, busy), Prepare Quote creates no draft and says why. The earlier empty
fallback draft took the visit's one draft slot and showed a blank panel. Revise
and Itemize materials use the same plain reasons.
