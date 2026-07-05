# TASK-059: My Day start-surface consolidation (remove odometer-unlocks-day framing)

Status:
Done

Phase:
0

Problem:
After the Operations Engine landed, My Day still carried the old framing that
fought the new model: a "Start Your Workday — log starting odometer to unlock day
tracking" hero (the day does NOT start via mileage anymore) and a "Complete &
Close Day" button that faked a close (toast + navigate, no business_days change)
and re-coupled mileage to the day ("close your mileage session before you can
close your day").

Business Value:
The Today header (Clock In / Open Day) is the unambiguous day-start; the rest of
My Day stops contradicting it.

Scope:
- Reframe the start_day hero to a Mileage Session (it lives under the "Start
  Mileage Session" tab), not "your workday"; drop the odometer-unlocks-day copy
  and the hardcoded name.
- Remove the fake, mileage-coupled "Complete & Close Day" button; the real,
  checklist-gated close is the Business Day control in the header. The tab becomes
  end-of-day review only.

Out of Scope:
- A full visual merge of the header + stepper into one block (later if wanted).

Acceptance Criteria:
- [x] No "unlock day tracking" / "Start Your Workday" framing on the mileage tab.
- [x] One day-close path (header); closing mileage/timer never closes the day.

Notes:
Verified in code: `WorkdayPanel` uses "Start Mileage Session" / "Review & Close Day";
My Work field tools (#463) removed Manage day accordion. Archived Phase 0 closeout (2026-07-06).