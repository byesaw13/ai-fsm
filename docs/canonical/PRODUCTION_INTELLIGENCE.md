# Production Intelligence

## Principle

Dovetails models **work first**. Pricing is one projection of that
understanding, not the thing the system is built around.

Most estimating software is organized around prices: a line item is a price with
a description attached. Dovetails inverts this. The authoritative object is the
**work itself** — what has to be done, how long it takes, what it needs, what can
go wrong, and how confident we are. Labor, materials, schedule, tools, risk,
profitability, and price are all **outputs derived from that shared
understanding**, not independent systems each re-inferring the same facts.

This is the architectural direction that makes Dovetails hard to replicate. A
competitor can copy a price book. They cannot easily copy an accumulating,
business-specific model of how *this* business does *this* work.

## The shape

```text
Assessment
    ↓
Assessment Summary        ← normalized understanding of the site/work
    ↓
Production Intelligence    ← the shared model of "the work"
    ↓
 ┌──────────┬───────────┬────────────┬──────────┬─────────┐
 │ Labor    │ Materials │ Scheduling │ Risk     │ Pricing │
 └──────────┴───────────┴────────────┴──────────┴─────────┘
    ↓
Estimate · Work Order · Invoice · Property History
```

Pricing sits at the **end** of that list deliberately. It is the last
projection, not the first input.

## Why this is already the architecture (not a new one)

This principle names a structure that **already emerged** in the codebase; it is
not a proposal to re-architect.

- `packages/domain/src/assessment-summary.ts` defines the canonical
  `AssessmentSummary` / `AssessmentRoom` and `buildAssessmentSummary`. This is
  the spine.
- Four independent consumers already read from that one shape: the materials
  generator (`/api/v1/estimates/ai-materials`), `buildWorkOrderDraft`
  (`packages/domain/src/work-order.ts`), estimate creation, and the property
  timeline.
- The summary already carries work-shaped fields beyond measurements —
  `workItems`, `prepNotes`, `tradeNotes`, `customerSuppliedMaterials` — and the
  materials generator already surfaces `assumptions`, `missing_measurements`,
  and `excluded_customer_supplied_items` rather than guessing.

The hub-and-spoke model exists. Production Intelligence is the name for the hub.

## Ubiquitous language

Five nouns form the application's ubiquitous language. Code, docs, and AI prompts
should use these terms consistently and in this order:

```text
Assessment  →  Assessment Summary  →  Work Item  →  Production Profile  →  Outputs
```

- **Assessment** — what was observed at the site.
- **Assessment Summary** — the normalized, semantic description of the work (not
  raw data entry).
- **Work Item** — a unit of work the application owns.
- **Production Profile** — how Dovetails performs that work item.
- **Outputs** — estimate, materials, work order, schedule, invoice, timeline,
  analytics — all projections.

These nouns live here while they are still partly conceptual. Each graduates into
`docs/canonical/DOMAIN_MODEL.md` as it becomes implemented truth in code — the
canonical doc leads, the domain model records what is built.

## Core objects (target model)

These are the durable nouns the model is moving toward. They are described here
so downstream features derive from one vocabulary instead of reinventing it.

- **Work Item** — a unit of work the *application* owns (e.g. "Replace Vanity"),
  not something the AI invents per estimate. Carries typical labor, difficulty,
  required trades, materials, consumables, tools, and risk factors.
- **Production Profile** — the reusable production characteristics of a work item
  or job shape: production rate, crew size, skill level, dependencies,
  confidence, and (eventually) historical performance. Pricing is *not* a field
  here — it is computed from it. A mature Production Profile is where Production
  Intelligence stops being an estimating feature and becomes the **operational
  core**: one profile can drive labor estimates, materials, schedules, technician
  instructions, quality checklists, invoice explanations, and future-estimate
  calibration. That breadth is also why it is gated — it earns its scope only
  after the Work Item Library exists to hang it on.
- **Confidence** — every estimate exposes how sure it is and *why* (e.g. "low
  confidence: ceiling height unknown, vanity not selected"). The system exposes
  uncertainty rather than pretending certainty.
- **Historical Performance** — completed work feeds back so estimates for similar
  future work improve. This knowledge belongs to Dovetails.

## What derives from the model (consumers, not subsystems)

Labor, materials, scheduling, travel, risk, profitability, and **pricing** are
all consumers of the production model. So are downstream surfaces already built:
estimates, work orders, invoices, and the property timeline. The rule is: there
is **one authoritative understanding of the work**, and every feature derives
from it rather than re-deriving it independently.

## Sources of truth (AI never owns a source)

Each kind of fact in the model has exactly one authoritative source. AI helps
*connect* these sources; it never *owns* one. This is the primary guard against
AI drift — the AI cannot quietly become the system of record for reality, work,
assumptions, or decisions.

| Source | Owns the truth about | AI's role |
|---|---|---|
| **Assessment** | observed conditions — what is actually at the site | extract / normalize, never invent |
| **Work Item** | required work — what the job consists of | assemble from the library, not author |
| **Production Profile** | how Dovetails performs the work — rates, crew, assumptions | apply, not guess |
| **Historical Production** | how Dovetails *actually* performed | calibrate against, not override |
| **Owner** | the final business decision (scope, price, go/no-go) | advise, never decide |

The rule: **reality comes from the assessment; work comes from the Work Item
Library; production assumptions come from Production Profiles; calibration comes
from completed jobs; business decisions come from the owner.** When AI output and
a source disagree, the source wins. When a source is missing, the model surfaces
the gap (see Confidence) rather than letting AI fill it silently.

## Relationship to the backlog (build discipline)

This note establishes **direction**, not a commitment to build a large epic.

- **TASK-018 (Assessment Summary Engine)** is the current Production Intelligence
  foundation — the de facto PI-001. Finishing TASK-018 *is* building the base of
  this model. See `docs/backlog/EPIC-002-estimating-and-assessments.md`.
- **EPIC-008 (Production Intelligence)** is intentionally a **stub** with two
  proposed tasks: the **Work Item Library** (the keystone — it converts "AI
  invents work" into "the app owns work") and the **Confidence Engine**.
- The remaining Production Intelligence ideas (historical learning, production
  advisor, analytics, benchmark dashboard, rule editor, knowledge-base baselines)
  are recorded as **strategic concepts, not committed work**. They earn backlog
  status only after TASK-018 proves the model in real use.

This discipline is the point. The model becomes a competitive advantage *because
it is validated in real use*, not because it is fully enumerated in advance. The
backlog's working rule applies: new ideas earn their place only after the shipped
foundation proves its value.

## Status

Direction is canonical. Implementation is deliberately incremental and gated on
TASK-018. This note may be revised as the model proves out; it does not commit
the product to building every concept named here.
