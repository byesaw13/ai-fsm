# TASK-238: Today and Desk never bounce you away

Status:
Proposed

Epic:
EPIC-006 Role-Based Workspaces

Phase:
0

Severity:
Medium. On a phone, the owner taps Desk and lands back on Today with no explanation.

Problem:
`components/WorkspaceAutoRoute.tsx` sends the owner to the preferred home (by device,
or the Settings cookie) every time they land on `/app` or `/app/my-work`. A tap on Desk
from a phone is replaced with Today, and the same happens the other way on a computer.
The only way out is a setting the user has to know about. `/app/my-day` still exists as
a redirect. Audit: UX direction section 31.

Scope:
- The auto-route applies only to the first page after login and to the logo, not to a
  tap on a Desk or Today menu item.
- Each home shows a small "Switch to Desk" / "Switch to Today" link in its header.
- Keep the device default and the Settings override from TASK-058.

Out of scope:
- Merging Desk and Today. TASK-143 keeps Desk as the office leak list.
- Removing the `/app/my-day` redirect (an old link may still point to it).

Acceptance Criteria:
- [ ] On a phone, tapping Desk opens Desk and stays there.
- [ ] Login and the logo still land on the device's preferred home.
- [ ] Each home has a visible one-tap switch to the other.

Test Plan:
- Unit: `post-login-destination` tests cover login vs menu-tap entry.
- E2E: phone viewport, tap Desk, Desk stays open.

Build:
Runbook Track E, step E2. Needs E1 Verified (it touches the same menu labels).

Related:
TASK-058 (workspace mode by device), TASK-143 (Desk is the leak list).
