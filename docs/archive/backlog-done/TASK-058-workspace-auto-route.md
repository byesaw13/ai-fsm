# TASK-058: Workspace mode auto-by-device + Settings override (remove popup/toggle)

Status:
Done

Phase:
0

Problem:
The Office/Field workspace choice is surfaced as an on-screen toggle plus a
once-a-day "Where are you working today?" popup — friction the owner finds
annoying, and it asks a question the device already answers.

Business Value:
Open the app and land in the right place automatically; switching is available
but out of the way.

Scope:
- Default workspace by viewport: phone → Field (`/app/my-work`), tablet/computer →
  Office (`/app`). A no-UI `WorkspaceAutoRoute` steers the office root on entry.
- Remove the daily popup and the top Office/Field toggle from the main screen
  (delete `WorkspaceSwitcher`).
- Add the only manual override to Settings (`WorkspaceModeSetting`: Auto / Field /
  Office), persisted in the `dv_ws_mode` cookie; Auto clears it.

Out of Scope:
- Server-side device detection; per-route mode beyond the office-root steer.

Acceptance Criteria:
- [x] No popup; no on-screen toggle.
- [x] Phone lands in Field, tablet/computer in Office, with no prompt.
- [x] Settings override (Auto/Field/Office) persists and takes effect.

Notes:
Shipped: `WorkspaceAutoRoute.tsx`, `WorkspaceModeSetting.tsx`, `SettingsTabsClient.tsx`.
Archived during Phase 0 closeout (2026-07-06).