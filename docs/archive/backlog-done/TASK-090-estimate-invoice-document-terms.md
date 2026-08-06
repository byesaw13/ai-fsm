# TASK-090: Separate estimate vs invoice document terms in Settings

Status:
Done

Phase:
3

Problem:
Estimate and invoice documents shared weak default terms, and Settings only
exposed a single invoice_terms field. Pre-job language (deposit before schedule,
change orders, access) and post-job collection language (late fees, payment
methods, deposit applied) need different editable copy.

Business Value:
Accurate legal/commercial language on each document moment; owner can edit both
without a code change.

Scope:
- Settings Company form: Estimate terms + Invoice terms (+ deposit wording).
- Domain defaults `STANDARD_ESTIMATE_TERMS` / `STANDARD_INVOICE_TERMS`.
- Branding + estimate print + PDF + portal fall back when fields blank.
- Document standard version bump when defaults change.

Acceptance Criteria:
- [x] Settings can edit estimate_terms and invoice_terms independently.
- [x] Blank fields use domain defaults on PDF/print/portal.
- [x] Estimate print uses branding.estimateTerms.
- [x] DOCUMENT_STANDARD_VERSION reflects the terms revision.

Notes:
Shipped PR #566 (`618b2ad`). **ID history:** originally filed as TASK-083 in
EPIC-004, colliding with attention Phase 2 TASK-083 in EPIC-005. Renumbered to
TASK-090 in backlog truth pass 2026-08-05 (attention keeps 083).
