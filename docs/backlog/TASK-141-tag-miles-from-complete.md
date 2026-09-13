# TASK-141: Tag claim miles from Complete + tag control on the day

Status:
In Progress

Phase:
1

Problem:
September had zero `vehicle_session_activities`. Miles never land on a job.

Business Value:
Complete at the house tags that day’s odometer (or the hops, if two jobs).

Scope:
- On visit closeout: if sole execution visit that day, tag untagged claim
  sessions to the job. If multiple jobs, tag overlapping GPS hops only.
- Mileage page: untagged claim row can add a job/visit/supplier tag
  (existing `POST /api/v1/sessions/:id/activities` + suggestions).

Out of Scope:
- Splitting one odometer reading across jobs by percent
- Tagging GPS hops onto job $ (reports stay claim-only)

Acceptance Criteria:
- [ ] Completing the only visit that day attaches the odometer session to the job
- [ ] Two visits that day do not dump the whole odometer on the first job
- [ ] User can tag an untagged claim row from the mileage page
