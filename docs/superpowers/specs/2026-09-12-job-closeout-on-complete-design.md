# Job closeout on Complete — Design Spec

**Date:** 2026-09-12  
**Status:** In Progress (owner approved 2026-09-12)  
**Backlog:** TASK-133 (parent) · TASK-134–138 (slices)  
**Phase:** 3 (billing connected to completed work) with a field surface in EPIC-007

---

## Problem

Complete today closes the **visit**. It does not close the **job**, capture what was done, book the next day, or draft the invoice.

Lived this week:

- **Bonnie Bowles (Thu morning, assemble bed).** Visit completed, work order completed, INV-0033 paid — but the **project stayed `in_progress`**. Complete meant “I left,” not “file it.”
- **63 Landing (Tue–Sat).** One house, several days, one invoice. GPS hours and receipts had to be reconstructed by hand. Complete on Wednesday must not invent a new job or a new bill.
- **Invoice copy.** A labor line that only says “Labor” is not sendable. The customer needs the work named. SKU itemization is not wanted on this path.

When the company has two people, the next tech (Tim covering Nick) walks the house for ~30 minutes asking what is left. That note should already exist from yesterday’s Complete.

## Goal

Tapping **Complete** on a visit is the closeout for **that job**, not for the whole day.

```text
Complete
  ├─ Done with this job?
  │    What did you do today? → complete project → draft invoice → send or hold
  └─ Coming back?
       What did you do today?
       When are you back? (tomorrow / pick a day / not sure)
       What’s first when you get here?
```

Several jobs in one day means several Completes. Bonnie bills at 10am. Landing stays open until you say done.

Night only catches leftovers: finished and unbilled, open with no next visit, receipts not on a job.

## Locked decisions

| Topic | Decision |
|---|---|
| Unit of closeout | The **job** (project), when this visit’s Complete runs |
| First question | Done vs coming back |
| Today’s work | Required. Stored as `visits.tech_notes`. Phone dictation is enough; no new voice table |
| Next visit | Required if coming back, unless “not sure.” Reuse `POST /api/v1/jobs/:id/visits` + `buildNextScheduleDayPrefill` |
| First-up | Required if coming back. Open/remainder `work_order_tasks` planned onto the next visit. Do not invent a handoff table |
| Invoice when done | Owner/tech Complete on **done** completes the project (`in_progress` → `completed`) and drafts the final invoice (existing `createDraftFinalInvoiceForJob`) |
| Labor line | One line. Description = stacked visit `tech_notes` for the job (fallback: job title). Qty = tracked `job_work` at the account bill rate. Do not change rates |
| Materials line | One rollup of `category = 'materials'` expenses on the job. **Not** SKU-itemized. No auto handling fee on this path |
| Dumping line | Separate line when a job expense looks like disposal (vendor/notes: dump, transfer station, debris, disposal; or `category = 'other'` with those words) |
| Coming back vs WO | Coming back **must not** auto-complete the work order. Today `syncWorkOrderStatus` can mark the WO completed when visits are terminal — that is wrong if more days are planned |
| Day clock | Unchanged. Visit Complete still does not close the business day (TASK-119) |
| Quick-job packet | Unchanged. Photos/signature stay optional on quick-book visits |
| Briefing | Compose existing notes + tasks + next visit on the **next visit** and My Day. No second inbox, no “handoff” noun (TASK-115) |
| Night | Leftovers only. Do not re-ask Bonnie if already invoiced |

## Out of scope (this wave)

- Chatbot / natural-language operator across the app
- Auto-creating the project from GPS (one-open-project-per-house attach) — follow-on, see TASK-133 notes
- Crew logins, dispatch board, Tim as a required second user
- Changing labor rates, tax, Square, or payment
- Estimate / quote spine
- New tables for briefings, work logs, or engagements

## Current code (verified 2026-09-12)

| Step | Today |
|---|---|
| Complete | `POST /api/v1/visits/:id/transition` `{ status: "completed" }` — visit done, time stopped, job → `in_progress`, **never** project complete |
| WO | `syncWorkOrderStatus` may complete the WO when visits are terminal |
| Invoice | Only `POST /api/v1/jobs/:id/transition` `{ status: "completed" }` → `createDraftFinalInvoiceForJob` |
| Labor copy | Always `"Labor"` |
| Materials | SKU lines when `expense_line_items` exist + optional handling fee |
| Next day | Job page “+ Add a day”; not on Complete |
| Notes | Optional `tech_notes`; Complete buttons do not require them |

## Field copy (phone)

**Screen 1 — after Complete**

> Done with this job, or coming back?

- Done  
- Coming back  

**If Done**

> What did you do today?  
> (required, large field, dictation OK)

Then: draft invoice, show three-line preview (labor / materials / dumping if any), **Send** or **Hold**.

**If Coming back**

> What did you do today? (required)  
> When are you back? Tomorrow · Pick a day · Not sure  
> What’s first when you get here? (required)

Save notes, schedule next visit unless not sure, write first-up as an open task on that visit (or on the WO if not sure). Stay on My Day for the next job.

## Next-person briefing (Tim)

On the next visit (and My Day hero for that visit), one card:

- **Yesterday (Nick):** `tech_notes` from the last completed visit  
- **On this job so far:** prior completed visits’ notes, oldest first  
- **First up:** the remainder/open task from Complete  
- **When:** scheduled start of this visit  

No new entity. If notes are missing, the card says so — do not invent work.

## Night leftovers

Day Review / Needs Attention adds (not a new home):

1. Project completed (or visit completed + “done”) with no non-cancelled invoice  
2. Open project with last visit completed and no future visit and not marked “not sure” without a reminder  
3. Today’s receipts with no `job_id`

Do not duplicate a job that already went through Send.

## Acceptance (parent)

Nick can, in one day:

1. Complete Bonnie, say **done**, dictate “assembled the bed,” see a draft invoice, send. Project is `completed`.  
2. Drive to Landing, Complete, say **coming back**, dictate the day’s paint, pick tomorrow, say “paint the bedroom.” Tomorrow’s visit exists. WO stays open. No invoice.  
3. Next morning, the Landing visit shows yesterday’s note and “paint the bedroom” first.  
4. Day Review does not re-ask Bonnie.

## Rollback

Revert the PRs. Visit Complete returns to today’s transition. No migration to reverse if we add no tables. If a column is required, it must be nullable additive.

## Sequencing

```
TASK-134  Complete fork (done vs coming back)
    └─ TASK-135  Coming-back packet (notes + next visit + first-up)
    └─ TASK-136  Done → complete project + draft invoice (copy + rollup)
         └─ TASK-137  Briefing card on next visit / My Day
              └─ TASK-138  Night leftovers
```

134 is the seam. 135 and 136 can proceed in parallel after 134’s API shape exists. 137 reads 135’s data. 138 last.
