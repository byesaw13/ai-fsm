# TASK-189: Write the hourly baseline formula down first

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-188

Problem:
The owner asked for the baseline formula, and what the hourly rate already
includes, to be written down before any code, so materials, overhead and profit
are never counted twice.

Scope:
- New `docs/working/hourly-baseline.md` with: the formula and clarifications
  from TASK-188 (low / midpoint / high person-hours, selling rate by state,
  materials at cost, handling only when turned on, equipment, travel once,
  other direct costs, effective labor rate on high-end hours against the cost
  floor); what the selling rate covers (labor cost, overhead, profit); the
  send rules (incomplete is a draft state, never a bypass); double-count rules
  (setup, protection, cleanup and travel are one line each at the right scope;
  an extra setup line is allowed when a separate visit or work area needs it).
- The Fixture A worked example.

Acceptance Criteria:
- [ ] The doc exists and is linked from TASK-188 and `docs/working/system-map.md`.
- [ ] Recomputing the worked example by hand from the doc gives $8,908.75 /
      $10,800.00 / $12,691.25, gap +$21.25 (+0.20%), effective rate $70.86/h.
- [ ] The owner has read and approved it before TASK-191 to TASK-195 start.

Effort:
0.5 day.
