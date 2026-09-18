# TASK-148: Geofence-anchored stops + home fence

**Epic:** 007 (Field Execution / location capture)
**Status:** Done (PR #655)

## Problem

GPS locating is vehicle-centric. Walking around a job, walking to the truck,
or walking next door for tools never splits a stop: `walking` is a no-op, and
a `location_update` more than 40 m away **moves the same stop’s pin**. Time
lands on whichever house the pin drifted to. Home only hides if HA named the
zone `home`/`private`, so a geocoded shop/house (8 Bus Rd) can score as job
work. Matching still attaches `job_id` from a job completed in the last 14
days. The live “You’re on site” prompt requires a visit scheduled today, so
unscheduled open-job callbacks get no CTA. An open stop at 8 pm is invisible
to night interview and Close Day (`ended_at IS NOT NULL`).

TASK-147 fixed vehicle blips. This is the remaining locating hole.

## Fix

Property-anchored stops. GPS asks; the owner still starts the clock.

- [x] Reducer: freeze the pin on `location_update` outside the fence; `still`
      outside the fence closes the stop and opens a new one. Inside the fence
      (or unmatched default 250 ft, min 80 m) stays one dwell. Vehicle blips
      still coalesce (TASK-147).
- [x] Learn home coords from HA zone `home`; treat anything inside that fence
      as private even when reverse-geocode is a street address.
- [x] Candidate `job_id` only from `scheduled` / `in_progress`. Completed jobs
      can still identify the house; they do not own today’s work.
- [x] Live prompt eligible for a distance-proven **open job**, not only
      `scheduledToday`. Auto-stamp presence stays scheduled-visit only.
- [x] Night interview + Close Day include the currently open stop (“still
      there”). Answering it records `stop_reason` without requiring GPS to
      have closed. TASK-077 auto-start stays deferred.

## Out of scope

- Auto-start labor on arrival (TASK-077).
- Auto-filing Home Depot onto the last job.
- Per-user GPS segments (one HA feed per account).
