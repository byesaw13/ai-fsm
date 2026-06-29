# TASK-022: Smart Start Day

Status:
Done

Problem:
Starting the day re-asks for information the system already knows — which
vehicle, its last odometer, the last session. That is typing the owner shouldn't
have to do at 7am.

Business Value:
- Removes morning friction; the day starts in one tap.
- Fewer odometer entry errors because the last reading is pre-filled.

Scope:
- Offer a one-tap "Start Day in <vehicle> · <last mileage>" action using the
  known last vehicle, last odometer, and last session.
- Fall back to the existing flow when there is no prior context (first use, new
  vehicle).

Out of Scope:
- Multi-vehicle selection UI changes beyond the one-tap default.
- End-of-day flow (TASK-023).

Acceptance Criteria:
- [x] Start Day presents a one-tap action prefilled with the last vehicle and
      last odometer.
- [x] Confirming starts a session without further input.
- [x] A clear path remains to choose a different vehicle / correct the odometer.

Notes:
Shipped. The "Start your day" card (`apps/web/app/app/DailyCommandCenter.tsx`)
now leads with a one-tap "Start Day in <nickname> · <last mileage> mi" button
that starts the session directly — no modal, because the prefilled odometer
equals the last reading so no warning/reason applies (`postStart` still handles
an unclosed prior session). A "Different vehicle or mileage?" link reveals the
original vehicle + odometer form. The default vehicle is the most recently used
one, computed by the pure, tested `pickStartVehicle` / `canSmartStart`
(`apps/web/lib/mileage/start-day.ts`); `last_used_at` (max session start per
vehicle) was added to the vehicles query in `apps/web/app/app/page.tsx`. Embodies
the Mobile First Field Rule. Builds on TASK-001 (vehicle sessions).
