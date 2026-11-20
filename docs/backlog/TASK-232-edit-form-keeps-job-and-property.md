# TASK-232: Saving a quote in the edit form keeps its job and property

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
High. A plain Save silently unlinks a quote from its job and house.

Problem:
`EstimateEditForm.tsx` clears the job and property as soon as it opens. Two effects reset
`jobId` and `propertyId` when they are not in the filtered dropdown lists, but those lists start
empty and fill only after `/api/v1/jobs` and `/api/v1/properties` load. On the first render the
check fails, so both are set to `""`. Save then sends `job_id: null` and `property_id: null`.

What happened on 2026-10-29 (Angela Dowd, EST-2026-0026): two Saves in the edit form left the quote
with no property and no job. The customer quote lost its address, and approval no longer reached the
job. It was relinked by hand on 2026-11-01. The code has been like this since PR #70/#75 (2026-02).

The lists are also capped at 200 rows (`?limit=200`). Once there are more jobs or properties, a quote
whose job or house is past the cap is cleared the same way even after loading.

Scope:
- The form never clears a saved job or property because the lists have not loaded. The reset effects
  run only after loading, and only when the user changes the client.
- A saved job or property that is not in the loaded list stays selected and is shown by name. It is
  fetched by id if needed. It is not dropped.
- Save sends `job_id` and `property_id` only when the user changed them. A save that does not touch them
  leaves them as stored.

Out of scope:
- Re-linking other quotes. Check approved quotes with no property in the release notes and fix them
  one by one with the owner.

Acceptance Criteria:
- [ ] Open a draft that has a job and a property, change only a line, and Save: job and property are
      unchanged.
- [ ] Changing the client still clears the job and property, as today.
- [ ] A quote whose job is not in the first 200 jobs keeps its job after Save.

Test Plan:
- Component or unit test: with the lists still loading, the form keeps the saved job and property.
- Integration test: PATCH from the edit form without touching job/property leaves both columns as they
  were.

Related:
TASK-222 (stale quote saves), TASK-223.
