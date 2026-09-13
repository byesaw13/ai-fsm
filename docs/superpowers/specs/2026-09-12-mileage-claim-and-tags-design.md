# Mileage claim vs GPS hops + tags — Design Spec

**Date:** 2026-09-12  
**Status:** In Progress (owner: plan and build)  
**Backlog:** TASK-140 (page) · TASK-141 (tag from Complete) · TASK-142 (untagged leftover)  
**Phase:** 1 (mileage / hybrid follow-on to TASK-091)

---

## Problem

September 2026: **9 odometer days = 501 claim miles**, **43 GPS hops = ~270 miles**, **0 tags**.

The mileage page sums both into one total, lists voided hops, and treats auto GPS as extra driving. Tags exist on log-session but nobody uses them, so job cost and billed travel get no miles.

## Goal

Odometer (or typed miles) is the **claim**. GPS hops are the **check** and, when tagged, the split across jobs. Night flags untagged claim days.

## Locked decisions

| Topic | Decision |
|---|---|
| Claim miles | `miles_source` in `odometer`, `manual_miles` (or null with odometer readings). Status not voided |
| GPS hops | `gps_estimate` / `bt_gps_estimate`. Not added into the headline total |
| Noise | GPS hop &lt; 1.0 mi hidden by default |
| Voided | Hidden on the month list |
| Day grouping | One day block: claim row(s) first, GPS hops nested |
| Auto-tag on Complete | If this is the **only** execution visit completed that day → tag that day’s **claim** session(s) to the job. If two+ jobs that day → tag **GPS hops** that overlap the visit window (±30 min), not the odometer |
| Never | Auto-tag GPS hops when a claim session for that day is also tagged (no double count on reports) |
| Reports / invoice travel | Sum tagged **claim** miles only (`odometer` / `manual_miles`). GPS hops can show as tags on the hop but do not add to job $ |
| Leftover | Closed claim sessions in the last 14 days with zero `vehicle_session_activities` |
| Out of scope | Personal vs commute split, stopping GPS from writing sessions, new tables |

## Acceptance

- September-style month: headline ≈ 501, not 501+270
- Voided and sub-mile hops not in the main list
- Completing the only visit that day tags the odometer row to the job
- Needs Attention shows untagged claim days
- Job profitability mileage ignores `gps_estimate`
