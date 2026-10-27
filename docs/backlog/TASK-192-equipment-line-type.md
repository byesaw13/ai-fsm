# TASK-192: Equipment line type

Status:
Done

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-188

Problem:
Line types are limited to labor, materials, handling_fee and adjustment
(`db/migrations/013_dovetails_domain.sql` CHECK). Equipment is either hidden in
materials (and so marked up by handling) or missing. The owner wants rentals
and explicit equipment-use charges shown and costed separately, without
charging the full purchase price of reusable tools to each job.

Scope:
- Migration 210: the line type CHECK on estimate and invoice line items gains
  `equipment`. 209 is person-hours and is already applied. Reversal converts
  equipment rows to materials, then restores the CHECK.
- Equipment lines are excluded from the materials total and handling, counted
  separately in the baseline and as a direct cost in the effective labor rate.
- Line editors offer "Equipment (rental or use charge)". Convert to invoice
  keeps the type.

Acceptance Criteria:
- [x] A $120 equipment line leaves the handling amount unchanged.
- [x] Convert produces an equipment invoice line.
- [x] The migration applies and reverses cleanly on a copy of production data.

Related:
TASK-152 (job materials and equipment become invoice lines; uses the same type).

Effort:
0.5 day.
