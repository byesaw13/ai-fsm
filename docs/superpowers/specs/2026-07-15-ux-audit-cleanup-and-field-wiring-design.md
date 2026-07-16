# UX Audit Cleanup + Field-Slice Wiring — Design

**Date:** 2026-07-15
**Status:** Approved (design), pending implementation plan
**Origin:** Two ponytail audits of the web UI surfaced a batch of zero-consumer
components. Investigation split them into *abandoned* code and *built-but-never-mounted*
feature work (PR #471, 2026-07-09). This spec covers both: delete the abandoned,
wire the built.

---

## Problem

The web UI carries components with zero importers. They fall into three kinds, and
the kind — not the "zero imports" fact — decides the fix:

1. **Abandoned** — dead, no feature waiting on it. Delete.
2. **Built-but-unmounted (worth surfacing)** — a finished component reading a live
   backend, just never dropped into a page. Wire it up (this is "surface the Hidden
   feature", not new development).
3. **Built-but-unmounted (speculative new behavior)** — finished, but it introduces
   an interruption/behavior nobody requested. Delete under the feature freeze.

## Non-goals

- No refactoring of the components' internals — they work; we mount or delete them.
- No new logic for the wired components beyond what mounting requires (props,
  triggers, layout slot).
- No activation of anything billing-adjacent from the inferred-location components.
- TASK-057 (Site Presence) is **not** being marked done; we're surfacing pre-built
  pieces of it, and the roadmap item stays as-is.

---

## Scope

### A. Delete — abandoned (no feature waiting)

| Target | Lines | Note |
|---|---|---|
| `packages/domain/src/stages.ts`: `getPipelineNextAction` + `PIPELINE_STAGE_ACTIONS` | ~30 | Zero non-test callers; accessor is a one-line record lookup. Remove the `getPipelineNextAction` describe block from `apps/web/lib/pipeline/__tests__/stages.unit.test.ts` too. |
| `apps/web/components/LeadCaptureSheet.tsx` | ~202 | Superseded by the live `QuickLeadModal`; dead since June through multiple refactors. |
| `apps/web/components/ui/Misc.tsx`: `Avatar`, `Breadcrumbs`, `ProgressBar` (+ their prop interfaces) | ~132 | Zero consumers, no backing feature. Keep `Tabs`/`TabDef` (1 caller). Barrel export unaffected — `Misc` still exports `Tabs`. |

### B. Delete — speculative new behavior (freeze)

| Target | Reason |
|---|---|
| `apps/web/components/field/EstimateNotStartedPrompt.tsx` | Always-on modal that interrupts the owner with "estimate not started" — a *new* proactive nag, not a surfaced feature. YAGNI until requested. |
| `apps/web/lib/field/estimate-reminders.ts` | Backs only the prompt. |
| `apps/web/app/api/v1/field/estimate-reminders/route.ts` + `.../estimate-reminders/mute/route.ts` | Serve only the prompt. |
| `apps/web/app/api/v1/field/end-site-timer/route.ts` | Verify: if consumed only by the deleted prompt/timer path, delete with the slice; if `SitePresenceCard`'s "leave" action uses it, keep (see C). |

> **Implementation note:** `end-site-timer` is the one ambiguous file. `SitePresenceCard`
> (kept, section C) has a leave/summary flow. Confirm during implementation whether the
> card's "leave" calls `end-site-timer`; if so it stays. Delete only what the prompt alone owns.

### C. Wire up — built features worth surfacing

All three read backends that are already live (the TASK-024 location pipeline).
Mounting is the whole job: a layout slot + props/trigger, no new logic.

| Component | Mount point | Data source (already in scope) |
|---|---|---|
| `DocumentClientLocationCard` | Invoice detail `apps/web/app/app/invoices/[id]/page.tsx` and estimate detail `apps/web/app/app/estimates/[id]/page.tsx`, beside the existing `<LinkedDocuments>` | Both pages already select `client_id`, `job_id`, `client_name`; backend routes `/api/v1/{invoices,estimates}/[id]/document-links` are live. Pass `entityType`, `entityId`, `canEdit`, `clientId`, `clientName`, `jobId`, `jobTitle`. |
| `SegmentLinkModal` | `apps/web/app/app/LocationSegmentsPanel.tsx` (rendered on `app/app/timeline/page.tsx`) — add a per-segment "Link" action that opens the modal | Controlled modal; panel already has each segment's `id`, `kind`, `placeLabel`, `startedAt`, `endedAt`. Backing `lib/field/segment-links.ts` + segment-link route. |
| `LikelySiteBanner` + `SitePresenceCard` | **My Day** — `apps/web/app/app/OwnerDashboard.tsx` (rendered by `app/app/page.tsx`) | Self-fetching from `/api/v1/field/site-context` (live). No props. |

---

## Design decisions

### Why wire B-worth-surfacing instead of deleting

The components are finished and read a pipeline that's already live. Deleting them
means rebuilding identical code at TASK-057's phase — pure waste. Surfacing
already-built features is the project's stated recovery strategy (discoverability
over development), so this *is* the aligned move, not a freeze violation. The freeze
stops *new behavior*, which is exactly why `EstimateNotStartedPrompt` (section B) is
cut and these are not.

### The inference calibration knob (LikelySiteBanner / SitePresenceCard)

These display an *inferred* "who you're with right now" from confidence-scored GPS
matching. If matching is noisy, they will confidently show the wrong customer.
Mitigations, both required:

1. **Mount on My Day only** — a dismissible, low-stakes surface. Nothing
   billing-adjacent keys off these components.
2. **Sanity gate before merge** — during implementation, hit `/api/v1/field/site-context`
   against real data and confirm it returns sane matches (or `null`) before mounting.
   `LikelySiteBanner` already self-hides when `likely`/`confirmedStop` are absent, so a
   quiet backend degrades to no banner rather than a wrong one — verify that holds.

### Ordering / independence

Each row in A, B, and C is independent and separately shippable. Suggested order:
A (pure deletes, no risk) → B (delete slice, verify `end-site-timer` ownership) →
C (wiring, one component at a time, card first since its backend is already proven
by the print page). No shared state between them.

---

## Verification

- **A/B deletes:** `pnpm typecheck` + `pnpm lint` must pass with zero unused-import or
  missing-reference errors (proves nothing referenced the deleted code). Run the
  `stages` unit test after trimming its describe block.
- **C wiring:** for each mounted component, load its host page in the running app and
  confirm it renders with real data (card editable on an invoice with a client; segment
  "Link" opens the modal and links; My Day shows the banner/card or correctly shows
  nothing when site-context is empty). Per the repo gate, business-logic-free wiring
  still gets an eyes-on check, not just typecheck.
- Full gate (`pnpm gate:fast`) before the PR.

## Rough size

- Delete (A+B): ~560+ lines of components/libs/routes removed, 0 deps.
- Wire (C): net small additions (mount slots, one trigger button, one settings-free
  banner) against ~1300 lines of already-written components brought to life.
