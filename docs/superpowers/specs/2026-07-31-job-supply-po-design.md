# Job Supply PO — Design Spec

**Date:** 2026-07-31  
**Status:** Approved (2026-07-31)  
**Roadmap:** Phase 3 — Estimate & Billing Closure  
**Epic:** EPIC-004 Billing & Profitability  
**Depends on:** TASK-039 job numbers (`J-YYYY-####`), materials catalog / receipt learning  

---

## Problem

Materials receipts rarely get linked to the right project. OCR can guess from addresses or HD “job tags,” but that is noisy. Supply houses (Home Depot, Lowe’s, Ace, Benson’s) accept a short **PO / job reference** at the register — if every Dovetails project has one easy number, techs can say it at checkout and receipts auto-match later.

### Already shipped

- `jobs.job_number` = `J-YYYY-####` (e.g. `J-2026-0029`) via trigger on insert  
- Receipt scan → line items + optional notes  
- Forgotten-receipts panel + freeform `extractReceiptPo` on notes  
- HD CSV import with soft title/address suggestions  

### Gap

No official **supply-house PO** derived from the job number, no first-class match on that PO, and no review queue for unlinked materials receipts with PO suggestions.

---

## Goals

1. Every job with a `job_number` has a deterministic **Supply PO** that is easy to say and write.  
2. Project page shows Supply PO with one-tap **copy**.  
3. Receipt OCR extracts PO when printed/written; scan form pre-selects the matching open job when unique.  
4. HD import / note matching prefer Supply PO over fuzzy title matches.  
5. Unlinked materials expenses surface in a **receipt review** queue with PO-based suggestions; human confirms before link.

## Non-goals (v1)

- Separate `supply_po` DB column (derived from `job_number` — no migration)  
- Auto-link without human confirmation on ambiguous matches  
- Requiring PO at the register (optional practice; matching still works without it)  
- Changing formal job number format `J-YYYY-####`  
- Vendor-specific PO APIs  

---

## Decision summary

| Topic | Decision |
|---|---|
| Source of truth | `jobs.job_number` only |
| Supply PO form | Spoken short: `J` + YY + 4-digit seq → `J260029` from `J-2026-0029` |
| Formal form | Keep `J-2026-0029` on UI; also match it |
| Why short | Easy to dictate at HD/Lowe’s (“J 26 0029”); fits PO fields |
| Auto pre-select | Unique exact PO / job_number match on open jobs only |
| Auto-write job_id | Never on scan alone; only after user save or review Accept |
| Review queue | Unlinked `materials` expenses; suggest from notes / extracted PO |
| Confidence | `exact` (auto-suggest) vs `none`; no weak fuzzy auto-suggest for PO |

---

## Numbering

```
job_number:  J-2026-0029
supply_po:   J260029
             ││└── seq (4 digits, zero-padded)
             │└─── year mod 100 (2 digits)
             └──── prefix J
```

### Accepted match inputs (normalized)

| Input | Matches job |
|---|---|
| `J260029` | `J-2026-0029` |
| `J-260029` | same |
| `J 26 0029` | same |
| `J-2026-0029` | same |
| `PO J260029` / `PO#J260029` / `P.O. J260029` | same |
| `260029` alone | **no** (too ambiguous without `J`) |

Year: prefer full century from job_number (`20` + YY). Seq is always 4 digits from the canonical job number.

---

## Domain API (`@ai-fsm/domain`)

```ts
// Pure helpers — no DB
toSupplyPo(jobNumber: string | null | undefined): string | null
// "J-2026-0029" → "J260029"

parseJobNumber(jobNumber: string): { year: number; seq: number; canonical: string; supplyPo: string } | null

extractSupplyPoCandidates(text: string): string[]
// Finds J#####, J-YYYY-####, PO-marked variants

matchJobsBySupplyPo(
  text: string,
  jobs: { id: string; job_number: string | null }[],
): { jobId: string; jobNumber: string; supplyPo: string; confidence: "exact" } | null
// Unique exact match only; else null
```

---

## Data flow

```
Project page
  job.job_number → toSupplyPo → "Supply PO J260029" + Copy

Tech at supply house
  says / writes PO J260029 on receipt

Receipt photo
  → POST /api/v1/expenses/scan-receipt
       AI extracts po_number (+ notes may include it)
  → client: matchJobsBySupplyPo(po + notes, open jobs)
       unique → pre-select job_id in ExpenseForm
  → POST /api/v1/expenses (user confirms job)

Unlinked materials expenses
  → /app/expenses/receipt-review
       extract candidates from notes / vendor fields
       suggest open job when exact PO match
       Accept → PATCH job_id; Dismiss stays unlinked

HD CSV import
  → preview: try Supply PO match on job_name / notes first,
             then existing title/address soft match
```

---

## UI

### Project page

- Desktop header / mobile subtitle area: **Supply PO `J260029`** with copy control.  
- Copy writes the short form (`J260029`) — what you tell the cashier.  
- Formal job number remains visible as today.

### Expense form (new / material run)

- Job picker labels: `J260029 · {title}` when job_number present.  
- After scan: if unique PO match and job not already chosen, set job (+ client when known).  
- Banner: “Matched Supply PO J260029 → {title}” (dismissible by changing job).

### Receipt review (`/app/expenses/receipt-review`)

- List materials expenses with `job_id IS NULL` (recent window, e.g. 180 days).  
- Columns: date, vendor, amount, extracted PO, suggested project, actions.  
- Accept → PATCH expense `job_id` (+ client_id when available).  
- Link from Expenses page header.

---

## OCR prompt addition

Add to receipt JSON schema:

```json
"po_number": "string or null — job / supply PO if written or printed (J260029, J-2026-0029, PO …)"
```

Rule: do not invent a PO; only extract when clearly present.

---

## Error handling

- Missing `job_number` → no Supply PO shown; matching skips that job.  
- Multiple jobs same PO impossible under unique `(account_id, job_number)`; if match text hits multiple (e.g. bad data), return no auto-suggest.  
- OCR miss → review queue / manual job pick.  
- Accept on already-linked expense → no-op / 409.

---

## Testing

- Domain unit tests: `toSupplyPo`, parse, extract candidates, unique match / non-match / ambiguity.  
- `extractReceiptPo` still works for HD tags; Supply PO extract covered in domain.  
- Expense form / review: unit-test pure match helpers; manual smoke on project copy + scan prefill.

---

## Rollout

1. Domain helpers + tests  
2. Project page Supply PO + copy  
3. Prompt + scan + form prefill + picker labels  
4. Import preview PO-first suggest  
5. Receipt review page + list/accept API  
6. PR → merge → deploy  

No DB migration.
