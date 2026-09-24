# TASK-160: Admin portal preview is read-only

Status:
In progress

Phase:
2

Epic:
EPIC-003 Property Intelligence

Problem:
PR #687 added "View Portal" (staff see a client's portal as the client does).
It created a real 30-day client login in the staff browser, "Exit Preview" did
not end it, staff could pay/approve/opt out as the client, opening invoices
marked them "opened by client", and the banner showed for any staff session.

Business Value:
Owners can check exactly what a customer (e.g. a realtor's Sponsored Work) sees
without corrupting the "client opened this" signal or acting as the client.

Scope:
- Preview sessions are flagged (`portal_sessions.is_preview`, migration 196) and
  expire after 2 hours.
- While previewing, the server rejects pay, estimate approve/decline, and SMS
  opt-out (403), and the UI hides those actions.
- Invoice "opened" tracking skips staff viewers (preview or logged-in staff).
- "Exit Preview" deletes the preview session and clears its cookie.
- Banner shows only in preview.

Acceptance Criteria:
- [ ] Preview requires an owner/admin session and creates a flagged, <=2h session.
- [ ] Client actions return 403 during preview and change nothing.
- [ ] Staff viewing an invoice does not set first_viewed_at or view_count.
- [ ] Exit removes the preview session.
