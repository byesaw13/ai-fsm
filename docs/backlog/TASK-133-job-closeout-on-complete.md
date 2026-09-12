# TASK-133: Job closeout on Complete (parent)

Status:
In Progress

Phase:
3

Problem:
Complete closes the visit and leaves the project open. Bonnie Bowles (J-2026-0049)
got a paid invoice while the project stayed `in_progress`. Landing Dr had to be
reconstructed by hand so one house became one invoice. The next person on a
multi-day job has no “what happened yesterday / start here” card.

Business Value:
The field Complete tap files the job: bill it now, or leave a day log and a next
visit. Cuts reconstruction and the ~30 min scavenger hunt when someone else
covers.

Scope:
- Parent for TASK-134–138. Do not ship features under this ID; ship the children.
- Design: `docs/superpowers/specs/2026-09-12-job-closeout-on-complete-design.md`
- ROADMAP Phase 3 wedge: invoice connected to completed work from the field.

Out of Scope:
- Chatbot / operator across the app
- GPS auto-creating the project (one-open-project-per-house)
- Crew product, dispatch, new briefing tables
- Rate, tax, Square, estimates

Acceptance Criteria:
- [ ] Spec is owner-approved
- [ ] Children TASK-134–138 exist in this backlog with pass/fail AC
- [ ] Canonical ROADMAP names this as the Phase 3 field-closeout wedge
- [ ] No new nouns: reuse visit, job, work_order_tasks, invoices, tech_notes

Notes:
Owner review 2026-09-12. Lived examples: Bonnie Bowles assemble bed; 63 Landing
garage door / paint / closet doors. Follow-on (not this parent): attach GPS and
receipts to the house’s single open project.
