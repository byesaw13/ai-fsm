# TASK-249: The server never creates a second customer for the same phone

Status:
In Progress

Epic:
EPIC-003 Property Intelligence

Phase:
2

Severity:
Medium. Duplicate customers split one property's history across two records.

Problem:
`clients` has no unique key on phone or email. SMS, intake and import normalize the phone (`lib/phone.ts` `normalizePhone`) and look for a match; `POST /api/v1/clients` and `POST /api/v1/quick-book` do not. TASK-245 adds matches while typing in the intake form; nothing stops a duplicate from the other doors. Audit 2026-11-24.

Scope:
- Step 1 (read-only): a query listing existing customers that share a normalized phone, in the PR. The owner decides merges (G4); none are made by this task. Result 2026-11-25: 3 pairs in the live account (counted per account; pairs across the historical d0000000 account are not duplicates).
- `lib/clients/match.ts` `findClientByContact`: email in any case, then phone by its last 10 digits (a shorter number matches only when typed the same). Client create returns the existing customer (200, `matched: true`) instead of inserting; intake and the CSV import use the same lookup. The import also compares the normalized name the way it is stored (a raw-vs-normalized mismatch let a re-import double customers). Quick-book takes only a name, so it cannot match by phone and is out of scope.
- After the owner has cleared the duplicates: migration adding a unique partial index on `(account_id, phone_normalized)` where not null (add the normalized column if missing, backfilled with `normalizePhone`).

Out of scope:
- A merge tool. Name or address matching (TASK-245).

Acceptance Criteria:
- [ ] Creating a customer with a known phone in any format returns the existing customer.
- [ ] Quick-book with a known phone uses the existing customer.
- [ ] Once the index ships, a direct duplicate insert fails.

Test Plan:
- Integration: create twice with "(603) 555-0100" and "6035550100"; one row.

Related:
TASK-245, TASK-250.
