# TASK-210: Price observation ledger and catalog cache

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-209

Depends on:
TASK-190 (PR #720)

Scope:
Append-only `price_observations` table (RLS, owner/admin write) as the price truth; catalog row is the product variant, unique per account + store family + SKU; one recompute function writes the catalog cache under a per-item lock in the same transaction as each observation; supplier normalization; every writer, including the catalog edit endpoint, goes through the ledger and needs an observed price and source; backfill (receipts as observations, catalog summaries as Low and never counted as purchases); remove the running-average code it replaces. Design sections 1 and 2.

Acceptance Criteria:
- [ ] Design acceptance criteria 2c, 5 and 5b pass.
- [ ] Backfill run twice gives the same ledger.
- [ ] RLS coverage check in the gate passes.

Design:
`docs/working/estimating-assistant-phase3.md` (owner decisions D1 to D11, eng decisions E1 to E10, correction passes of 2026-10-26).

Effort:
2 d / 2 h
