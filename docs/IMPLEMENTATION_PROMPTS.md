# Implementation Prompts — Remaining Feature Roadmap

These 10 prompts represent the full remaining implementation roadmap for ai-fsm, derived from `docs/operationpipeline` and the Dovetails product alignment roadmap. Execute them in order — each prompt is self-contained and assumes all previous prompts have been completed.

## Execution Order Summary

| # | Feature | Key Deliverable | Gate |
|---|---------|-----------------|------|
| 1 | ~~Status history / audit trail~~ | `036_status_history.sql` + `recordStatusChange()` | Done |
| 2 | Consent & contact prefs | `037_consent_contact_prefs.sql` + booking form fields | pnpm gate:fast |
| 3 | Assisted intake screen | `/app/intake/new` + `IntakeForm.tsx` | pnpm gate:fast |
| 4 | Duplicate detection | `duplicate_candidate_ids` column + warning UI | pnpm gate:fast |
| 5 | Scheduling gates | `scheduling-guard.ts` + visit creation wire-in | pnpm gate:fast |
| 6 | Completion packets | `039_completion_packets.sql` + checklist UI | pnpm gate:fast |
| 7 | Exception lanes (sub-statuses) | `040_sub_statuses.sql` + badge UI | pnpm gate:fast |
| 8 | Communications log | `041_communications_log.sql` + `logCommunication()` | pnpm gate:fast |
| 9 | Operations dashboard | `/app/operations/page.tsx` (9 parallel queries) | pnpm gate:fast |
| 10 | Portal updates + channel continuity | Contact prefs in portal + SMS opt-out | pnpm gate:fast |

---

## ~~Prompt 1 — Status History / Audit Trail~~ — Done

Status: Done on 2026-05-09.

**Context**: The repo is at `/home/nick/ai-fsm-deploy-clean`. Stack: Next.js 15 (app router, React 19), PostgreSQL 16, raw SQL (no ORM), pnpm monorepo. All entities have `account_id` for multi-tenant RLS.

**Goal**: Create an immutable append-only status history log that records every status transition across all major entities (jobs, visits, estimates, invoices, booking_requests).

**Tasks**:

1. Create `db/migrations/036_status_history.sql`:
   ```sql
   CREATE TABLE status_history (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     account_id    uuid NOT NULL,
     entity_type   text NOT NULL CHECK (entity_type IN ('job','visit','estimate','invoice','booking_request')),
     entity_id     uuid NOT NULL,
     from_status   text,
     to_status     text NOT NULL,
     changed_by    uuid REFERENCES users(id),
     note          text,
     created_at    timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX status_history_entity ON status_history(entity_type, entity_id);
   CREATE INDEX status_history_account ON status_history(account_id, created_at DESC);
   -- RLS
   ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
   CREATE POLICY status_history_account_isolation ON status_history
     USING (account_id = current_setting('app.current_account_id', true)::uuid);
   ```

2. Create `apps/web/lib/status-history.ts` exporting:
   ```typescript
   export async function recordStatusChange(
     client: PoolClient,
     opts: {
       accountId: string;
       entityType: 'job' | 'visit' | 'estimate' | 'invoice' | 'booking_request';
       entityId: string;
       fromStatus: string | null;
       toStatus: string;
       changedBy?: string | null;
       note?: string | null;
     }
   ): Promise<void>
   ```
   The function runs `INSERT INTO status_history ...` using the passed `client` (caller manages the transaction).

3. Wire `recordStatusChange` into the booking-request PATCH route (`apps/web/app/api/v1/booking-requests/[id]/route.ts`) and the convert route (`apps/web/app/api/v1/booking-requests/[id]/convert/route.ts`). Pass the existing transaction client. `changedBy` = `session.userId`.

4. Add a unit test in `apps/web/lib/__tests__/status-history.unit.test.ts` that mocks the pool client and asserts the INSERT is called with correct parameters.

5. Run `pnpm gate:fast` — must pass before finishing.

---

## Prompt 2 — Consent & Contact Preference Fields

**Context**: Same repo. FCC / A2P 10DLC compliance requires storing SMS consent with timestamp, source, and verbatim disclosure text. Contact preferences govern which channels (SMS, email, phone) may be used for each client.

**Goal**: Add consent and contact preference columns to clients and booking_requests; surface the fields in the booking form and the booking-request detail/edit UI.

**Tasks**:

1. Create `db/migrations/037_consent_contact_prefs.sql`:
   ```sql
   ALTER TABLE clients
     ADD COLUMN IF NOT EXISTS sms_consent          boolean NOT NULL DEFAULT false,
     ADD COLUMN IF NOT EXISTS sms_consent_at       timestamptz,
     ADD COLUMN IF NOT EXISTS sms_consent_source   text,
     ADD COLUMN IF NOT EXISTS sms_consent_text     text,
     ADD COLUMN IF NOT EXISTS preferred_contact    text NOT NULL DEFAULT 'email'
                              CHECK (preferred_contact IN ('sms','email','phone')),
     ADD COLUMN IF NOT EXISTS contact_notes        text;

   ALTER TABLE booking_requests
     ADD COLUMN IF NOT EXISTS sms_consent          boolean NOT NULL DEFAULT false,
     ADD COLUMN IF NOT EXISTS sms_consent_at       timestamptz,
     ADD COLUMN IF NOT EXISTS preferred_contact    text NOT NULL DEFAULT 'email'
                              CHECK (preferred_contact IN ('sms','email','phone'));
   ```

2. Update the public booking form (`apps/web/app/booking/page.tsx` or wherever the customer-facing form lives) to add:
   - A "Preferred contact method" radio group (Email / SMS / Phone).
   - An SMS consent checkbox (only shown when SMS is selected): label must include verbatim disclosure text: `"By checking this box you consent to receive text messages from Dovetails Services LLC about your service requests. Message & data rates may apply. Reply STOP to opt out."`. Checking this records `sms_consent=true`, `sms_consent_at=now()`, `sms_consent_source='booking_form'`.
   - Pass both fields in the POST body to `POST /api/booking`.

3. Update `apps/web/app/api/booking/route.ts`:
   - Accept `preferred_contact` and `sms_consent` from the request body (validate with Zod — `preferred_contact` enum, `sms_consent` boolean).
   - Insert both into `booking_requests` with `sms_consent_at = NOW()` when consent is true.

4. Update the booking-request detail page (`apps/web/app/app/booking-requests/[id]/page.tsx`) to display these fields in a "Contact Preferences" section.

5. Run `pnpm gate:fast` — must pass.

---

## Prompt 3 — Assisted Intake Screen

**Context**: Same repo. When the business owner takes a call or walks a job, they need a staff-side intake form that creates a booking_request directly (bypassing the public form). The form should be a 2-step flow with a read-back confirmation step before submission.

**Goal**: Build `/app/intake/new` — a staff-facing intake form that creates a booking_request and optionally queues it for scheduling.

**Tasks**:

1. Create page `apps/web/app/app/intake/new/page.tsx` (server component wrapper, requires auth — redirect to `/login` if no session, redirect to `/app` if role is `tech`). Renders `<IntakeForm />`.

2. Create client component `apps/web/app/app/intake/new/IntakeForm.tsx`:
   - **Step 1 — Capture**: Fields: client name (text, required), phone (tel), email (email), service category (select — same categories as the public form), description (textarea), preferred date (date), preferred time slot (select: morning/afternoon/evening/flexible), address (text), city (text), sms_consent (checkbox with verbatim disclosure), preferred_contact (radio: email/sms/phone).
   - **Step 2 — Read-back**: Display all entered values in a confirmation card. Staff reads back to client. "Edit" button returns to step 1. "Confirm & Submit" posts to `POST /api/v1/intake` (new internal endpoint, see below).
   - On success: redirect to `/app/booking-requests` with a toast "Booking request created".
   - On error: show inline error, stay on step 2.

3. Create `apps/web/app/api/v1/intake/route.ts`:
   - Auth: session required, role must be `owner` or `admin` (use `withRole`).
   - Body schema (Zod): same fields as the public booking form plus `sms_consent`, `preferred_contact`.
   - Logic: `INSERT INTO booking_requests (...) VALUES (...) RETURNING id`. Set `sms_consent_source = 'staff_intake'` when consent is true. No client/property/job creation at this point (that happens on convert).
   - Return `201 { id }`.

4. Add a "New Intake" button to the booking-requests list page header (`apps/web/app/app/booking-requests/page.tsx`) linking to `/app/intake/new`.

5. Add a unit test `apps/web/app/api/v1/intake/__tests__/intake.unit.test.ts` covering: 201 success, 400 missing required fields, 401 unauthenticated, 403 tech role.

6. Run `pnpm gate:fast` — must pass.

---

## Prompt 4 — Duplicate Detection

**Context**: Same repo. When a new booking request arrives (public form or staff intake), the system should flag potential duplicates — same client name + phone/email within the past 90 days — so staff can review before converting.

**Goal**: Add a `duplicate_candidate_ids` column to booking_requests and populate it on insert; surface a warning banner on the booking-request detail page when duplicates exist.

**Tasks**:

1. Create `db/migrations/038_duplicate_detection.sql`:
   ```sql
   ALTER TABLE booking_requests
     ADD COLUMN IF NOT EXISTS duplicate_candidate_ids uuid[] DEFAULT '{}';
   ```

2. Update `apps/web/app/api/booking/route.ts` (public form) and `apps/web/app/api/v1/intake/route.ts` (staff intake):
   - After inserting the new booking_request, run a second query (same transaction):
     ```sql
     SELECT id FROM booking_requests
     WHERE account_id = $1
       AND id != $2
       AND status NOT IN ('cancelled','converted')
       AND created_at > NOW() - INTERVAL '90 days'
       AND (
         (email IS NOT NULL AND email = $3) OR
         (phone IS NOT NULL AND phone = $4) OR
         (lower(name) = lower($5))
       )
     LIMIT 5
     ```
   - If any rows found, `UPDATE booking_requests SET duplicate_candidate_ids = $candidates WHERE id = $newId`.

3. Update the booking-request detail page (`apps/web/app/app/booking-requests/[id]/page.tsx`):
   - Fetch `duplicate_candidate_ids` from the row.
   - If the array is non-empty, query those booking_requests (name, created_at, status) and render a yellow warning banner: "Possible duplicate — [N] similar request(s) found in the last 90 days." with links to each duplicate.

4. Run `pnpm gate:fast` — must pass.

---

## Prompt 5 — Scheduling Gates

**Context**: Same repo. A visit must not be creatable unless the parent job has an approved estimate (status `quoted` or later) and no other visit for that job is already active (status `scheduled`, `arrived`, or `in_progress`). These rules must be enforced at the API layer.

**Goal**: Create a `scheduling-guard.ts` module with pure guard functions, wire it into the visit-creation API route, and add unit tests.

**Tasks**:

1. Create `packages/domain/src/scheduling-guard.ts`:
   ```typescript
   export type SchedulingGuardError =
     | 'JOB_NOT_FOUND'
     | 'ESTIMATE_NOT_APPROVED'
     | 'ACTIVE_VISIT_EXISTS';

   export interface SchedulingGuardResult {
     ok: boolean;
     error?: SchedulingGuardError;
   }

   /** Pure function — validates scheduling preconditions from already-fetched data */
   export function checkSchedulingPreconditions(opts: {
     jobStatus: string | null;
     activeVisitCount: number;
   }): SchedulingGuardResult {
     if (!opts.jobStatus) return { ok: false, error: 'JOB_NOT_FOUND' };
     if (!['quoted','scheduled','in_progress','completed','invoiced'].includes(opts.jobStatus)) {
       return { ok: false, error: 'ESTIMATE_NOT_APPROVED' };
     }
     if (opts.activeVisitCount > 0) return { ok: false, error: 'ACTIVE_VISIT_EXISTS' };
     return { ok: true };
   }
   ```
   Export from `packages/domain/src/index.ts`.

2. Wire into the visit-creation API route (find it with `find apps/web/app/api -name "route.ts" | xargs grep -l "INSERT INTO visits" | head -5`):
   - Before inserting, run two queries inside the transaction:
     ```sql
     SELECT status FROM jobs WHERE id = $jobId AND account_id = $accountId
     ```
     ```sql
     SELECT COUNT(*) FROM visits WHERE job_id = $jobId AND status IN ('scheduled','arrived','in_progress')
     ```
   - Call `checkSchedulingPreconditions({ jobStatus, activeVisitCount })`.
   - If `!result.ok`: rollback and return `422 { error: result.error }`.

3. Add unit tests `packages/domain/src/__tests__/scheduling-guard.unit.test.ts` covering all 4 outcomes (ok, JOB_NOT_FOUND, ESTIMATE_NOT_APPROVED, ACTIVE_VISIT_EXISTS).

4. Run `pnpm gate:fast` — must pass.

---

## Prompt 6 — Completion Packets

**Context**: Same repo. A visit cannot be marked `completed` unless required evidence has been attached: at minimum one photo and a client signature (or explicit waiver). This prevents incomplete job records and supports invoicing.

**Goal**: Add a `completion_packets` table; enforce the guard in the visit status-update route; add a checklist UI on the visit detail page.

**Tasks**:

1. Create `db/migrations/039_completion_packets.sql`:
   ```sql
   CREATE TABLE completion_packets (
     id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     account_id      uuid NOT NULL,
     visit_id        uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
     photo_urls      text[] NOT NULL DEFAULT '{}',
     signature_url   text,
     signature_waiver boolean NOT NULL DEFAULT false,
     notes           text,
     created_at      timestamptz NOT NULL DEFAULT now(),
     created_by      uuid REFERENCES users(id)
   );
   CREATE UNIQUE INDEX completion_packets_visit ON completion_packets(visit_id);
   ALTER TABLE completion_packets ENABLE ROW LEVEL SECURITY;
   CREATE POLICY completion_packets_account ON completion_packets
     USING (account_id = current_setting('app.current_account_id', true)::uuid);
   ```

2. Create `apps/web/lib/completion-guard.ts`:
   ```typescript
   export interface CompletionPacket {
     photo_urls: string[];
     signature_url: string | null;
     signature_waiver: boolean;
   }
   export type CompletionGuardError = 'MISSING_PHOTO' | 'MISSING_SIGNATURE';
   export function checkCompletionPacket(packet: CompletionPacket | null): { ok: boolean; error?: CompletionGuardError } {
     if (!packet || packet.photo_urls.length === 0) return { ok: false, error: 'MISSING_PHOTO' };
     if (!packet.signature_url && !packet.signature_waiver) return { ok: false, error: 'MISSING_SIGNATURE' };
     return { ok: true };
   }
   ```

3. Wire into the visit status-update API route (find it with `find apps/web/app/api -name "route.ts" | xargs grep -l "UPDATE visits" | head -5`): when transitioning to `completed`, query `completion_packets` for the visit and call `checkCompletionPacket`. If `!ok`, return `422 { error }`.

4. On the visit detail page (`apps/web/app/app/visits/[id]/page.tsx`), add a "Completion Checklist" section visible when visit status is `in_progress`:
   - Shows: "Photos" (count or "none"), "Signature" (captured/waived/missing).
   - A "Mark Complete" button that is disabled if the packet is incomplete, with a tooltip explaining what's missing.
   - For MVP, photos and signature can be placeholder text inputs (URLs); the upload/capture UI is out of scope for this prompt.

5. Add unit tests for `completion-guard.ts` in `apps/web/lib/__tests__/completion-guard.unit.test.ts`.

6. Run `pnpm gate:fast` — must pass.

---

## Prompt 7 — Exception Lanes (Sub-statuses)

**Context**: Same repo. Occasionally a job or visit is in an exceptional state (waiting for parts, customer no-show, weather hold, dispute) that does not change the core status but needs to be visible to staff. Sub-statuses are internal exception lanes that overlay the main status without modifying the frozen status enums.

**Goal**: Add a `sub_status` column to jobs and visits; define sub-status domain types; surface sub-status badges in the UI.

**Tasks**:

1. Create `db/migrations/040_sub_statuses.sql`:
   ```sql
   ALTER TABLE jobs
     ADD COLUMN IF NOT EXISTS sub_status text
       CHECK (sub_status IN ('waiting_parts','customer_hold','dispute','quote_revision'));
   ALTER TABLE visits
     ADD COLUMN IF NOT EXISTS sub_status text
       CHECK (sub_status IN ('no_show','weather_hold','waiting_parts','reschedule_requested'));
   ```

2. Create `packages/domain/src/sub-statuses.ts`:
   ```typescript
   export const JOB_SUB_STATUSES = ['waiting_parts','customer_hold','dispute','quote_revision'] as const;
   export const VISIT_SUB_STATUSES = ['no_show','weather_hold','waiting_parts','reschedule_requested'] as const;
   export type JobSubStatus = typeof JOB_SUB_STATUSES[number];
   export type VisitSubStatus = typeof VISIT_SUB_STATUSES[number];

   export const SUB_STATUS_LABELS: Record<string, string> = {
     waiting_parts:        'Waiting Parts',
     customer_hold:        'Customer Hold',
     dispute:              'Dispute',
     quote_revision:       'Quote Revision',
     no_show:              'No Show',
     weather_hold:         'Weather Hold',
     reschedule_requested: 'Reschedule Requested',
   };
   ```
   Export from `packages/domain/src/index.ts`.

3. Add a `PATCH /api/v1/jobs/[id]/sub-status` route (`apps/web/app/api/v1/jobs/[id]/sub-status/route.ts`):
   - Body: `{ sub_status: JobSubStatus | null }` (null clears it).
   - Auth: `withRole(['owner','admin'])`.
   - `UPDATE jobs SET sub_status = $1 WHERE id = $2 AND account_id = $3 RETURNING id, sub_status`.
   - Return `200 { id, sub_status }`.

4. Add the same endpoint for visits: `PATCH /api/v1/visits/[id]/sub-status`.

5. On the jobs list page and visits list page, render a small amber `<StatusBadge>` next to the main status badge when `sub_status` is set. The badge text comes from `SUB_STATUS_LABELS`.

6. On job detail and visit detail pages, add a "Set Exception" select input (inline, no separate form) that calls the sub-status PATCH endpoint. Options: the applicable sub-statuses + "Clear".

7. Add unit tests for the sub-status PATCH routes (200 success, 400 invalid sub-status, 403 tech role).

8. Run `pnpm gate:fast` — must pass.

---

## Prompt 8 — Communications Log

**Context**: Same repo. FCC and business policy require a complete audit trail of every SMS, email, and phone-call attempt made for each client. This log is write-once (no updates, no deletes) and must capture channel, direction, outcome, and the session user who initiated it.

**Goal**: Add a `communications_log` table and a `logCommunication()` helper; wire it into any existing send-SMS or send-email paths; add a communications history section to the client detail page.

**Tasks**:

1. Create `db/migrations/041_communications_log.sql`:
   ```sql
   CREATE TABLE communications_log (
     id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     account_id      uuid NOT NULL,
     client_id       uuid REFERENCES clients(id),
     booking_request_id uuid REFERENCES booking_requests(id),
     job_id          uuid REFERENCES jobs(id),
     visit_id        uuid REFERENCES visits(id),
     channel         text NOT NULL CHECK (channel IN ('sms','email','phone')),
     direction       text NOT NULL CHECK (direction IN ('outbound','inbound')),
     outcome         text NOT NULL CHECK (outcome IN ('sent','delivered','failed','no_answer','left_voicemail','replied')),
     body_preview    text,
     initiated_by    uuid REFERENCES users(id),
     external_id     text,
     created_at      timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX comms_log_client ON communications_log(client_id, created_at DESC);
   CREATE INDEX comms_log_account ON communications_log(account_id, created_at DESC);
   ALTER TABLE communications_log ENABLE ROW LEVEL SECURITY;
   CREATE POLICY comms_log_account ON communications_log
     USING (account_id = current_setting('app.current_account_id', true)::uuid);
   ```

2. Create `apps/web/lib/communications-log.ts`:
   ```typescript
   import { query } from '@/lib/db';

   export interface LogCommunicationOpts {
     accountId: string;
     channel: 'sms' | 'email' | 'phone';
     direction: 'outbound' | 'inbound';
     outcome: 'sent' | 'delivered' | 'failed' | 'no_answer' | 'left_voicemail' | 'replied';
     clientId?: string | null;
     bookingRequestId?: string | null;
     jobId?: string | null;
     visitId?: string | null;
     bodyPreview?: string | null;
     initiatedBy?: string | null;
     externalId?: string | null;
   }

   export async function logCommunication(opts: LogCommunicationOpts): Promise<void> {
     await query(
       `INSERT INTO communications_log
          (account_id, channel, direction, outcome, client_id, booking_request_id,
           job_id, visit_id, body_preview, initiated_by, external_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
       [opts.accountId, opts.channel, opts.direction, opts.outcome,
        opts.clientId ?? null, opts.bookingRequestId ?? null,
        opts.jobId ?? null, opts.visitId ?? null,
        opts.bodyPreview ?? null, opts.initiatedBy ?? null, opts.externalId ?? null]
     );
   }
   ```

3. Search for any existing SMS/email dispatch paths (grep for `twilio`, `sendgrid`, `nodemailer`, `fetch.*sms`, `fetch.*email` in `apps/web/` and `services/worker/`). For each found, call `logCommunication` after the send attempt, capturing the outcome.

4. Add a GET endpoint `apps/web/app/api/v1/clients/[id]/communications/route.ts`:
   - Auth: session required, role owner or admin.
   - Query `communications_log WHERE client_id = $clientId AND account_id = $accountId ORDER BY created_at DESC LIMIT 50`.
   - Return `200 { logs: [...] }`.

5. On the client detail page (`apps/web/app/app/clients/[id]/page.tsx`), add a "Communications" section at the bottom showing the last 20 log entries (channel icon, direction arrow, outcome pill, date, body preview truncated to 80 chars).

6. Add a unit test for `logCommunication` in `apps/web/lib/__tests__/communications-log.unit.test.ts` that mocks `query` and asserts correct parameter mapping.

7. Run `pnpm gate:fast` — must pass.

---

## Prompt 9 — Operations Dashboard

**Context**: Same repo. The current dashboard at `/app` shows basic counts. The operations pipeline doc (`docs/operationpipeline`) defines a richer view: pipeline stage counts, today's schedule, alerts/exceptions, booking queue, and revenue summary. This prompt builds that full operations dashboard.

**Goal**: Replace or augment `/app` with a proper operations dashboard that shows all 9 data panels from the pipeline doc.

**Tasks**:

1. Create `apps/web/app/app/operations/page.tsx` (new route, server component, auth required):
   Run 9 queries in parallel via `Promise.all`:
   - **P1 — Booking queue**: `SELECT COUNT(*) FROM booking_requests WHERE account_id=$1 AND status='pending'`
   - **P2 — Active stage counts**: jobs by status buckets (draft/quoted/scheduled/in_progress/completed/invoiced) — single GROUP BY query
   - **P3 — Today's visits**: `SELECT v.*, j.title, c.name AS client_name FROM visits v JOIN jobs j ON j.id=v.job_id JOIN clients c ON c.id=j.client_id WHERE v.scheduled_date=CURRENT_DATE AND v.account_id=$1 ORDER BY v.scheduled_start`
   - **P4 — Overdue invoices**: `SELECT COUNT(*), COALESCE(SUM(total_cents),0) FROM invoices WHERE account_id=$1 AND status='overdue'`
   - **P5 — Open estimates**: `SELECT COUNT(*) FROM estimates WHERE account_id=$1 AND status IN ('draft','sent') AND expires_at < NOW() + INTERVAL '7 days'`
   - **P6 — Exception lanes**: `SELECT COUNT(*) FROM jobs WHERE account_id=$1 AND sub_status IS NOT NULL UNION ALL SELECT COUNT(*) FROM visits WHERE account_id=$1 AND sub_status IS NOT NULL` (requires Prompt 7)
   - **P7 — Unreviewed booking requests**: count of `needs_info` status
   - **P8 — Revenue this month**: `SELECT COALESCE(SUM(total_cents),0) FROM invoices WHERE account_id=$1 AND status IN ('partial','paid') AND created_at >= date_trunc('month', NOW())`
   - **P9 — Scheduled this week**: count of visits with `scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6`

2. Render a responsive grid layout (2-col on desktop, 1-col on mobile) with 9 `<Card>` panels. Each panel has a title, primary metric (large number), and a link to the relevant list page.

3. Add a "Today's Schedule" panel as a full-width card below the grid showing the P3 visit list: client name, job title, time, visit status badge.

4. Add an "Exceptions & Alerts" panel: combines overdue invoices count (link to `/app/invoices?status=overdue`), expiring estimates (link to `/app/estimates?status=sent`), and exception-lane count (link to jobs/visits with sub_status set).

5. Update the sidebar nav: change the Dashboard link in `AppShell.tsx` from `href: "/app"` to `href: "/app/operations"`, keeping the label "Dashboard". Update the `isNavActive` logic so `/app/operations` is the active item when on that path.

6. The old `/app` page (`apps/web/app/app/page.tsx`) remains but can be simplified to redirect to `/app/operations` via `redirect('/app/operations')` at the top of the server component.

7. Run `pnpm gate:fast` — must pass.

---

## Prompt 10 — Portal Updates & Channel Continuity

**Context**: Same repo. The client portal at `/portal/[clientToken]` currently shows job/visit status. This prompt adds: contact preference display and opt-out, SMS opt-out endpoint (required by FCC/A2P 10DLC), and a communications history section so clients can see what was sent to them.

**Goal**: Surface contact preferences in the portal; add an SMS opt-out mechanism; show a simplified communications history.

**Tasks**:

1. Add a "Contact Preferences" section to the portal page (`apps/web/app/portal/[clientToken]/page.tsx`):
   - Query the client's `preferred_contact` and `sms_consent` fields (requires Prompt 2).
   - Display current preference: "We'll contact you by [email/phone/SMS]."
   - If `sms_consent=true`, show an "Opt out of SMS" button (POST to `/api/portal/[clientToken]/sms-opt-out`).

2. Create `apps/web/app/api/portal/[clientToken]/sms-opt-out/route.ts`:
   - Verify token via `SELECT id, account_id FROM client_portal_tokens WHERE token=$1 AND expires_at > NOW()` (or however the portal auth works in the existing code — check the actual portal auth pattern first).
   - `UPDATE clients SET sms_consent=false, sms_consent_at=NOW(), preferred_contact='email' WHERE id=$clientId AND account_id=$accountId`.
   - Log to `communications_log` (requires Prompt 8): `channel='sms', direction='inbound', outcome='replied', body_preview='STOP (portal opt-out)'`.
   - Return `200 { ok: true }`.
   - No auth session required (portal is token-authenticated).

3. Add a "Message History" section to the portal (last 5 outbound communications for this client):
   - Query: `SELECT channel, outcome, body_preview, created_at FROM communications_log WHERE client_id=$clientId AND direction='outbound' ORDER BY created_at DESC LIMIT 5`.
   - Render as a simple list: date, channel (SMS/Email), body preview. No outcome details (keep it client-friendly).

4. Update the portal's `derivePortalStage` logic: after opting out of SMS, if `preferred_contact` was `sms`, change it to `email` (already handled by the opt-out route above — verify the portal page re-reads `preferred_contact` from DB on each request, which it should since it's a server component with `dynamic='force-dynamic'`).

5. Add a unit test `apps/web/app/api/portal/__tests__/sms-opt-out.unit.test.ts`:
   - Mock DB queries for token lookup, client update.
   - Assert 200 on valid token with SMS consent.
   - Assert 404 on invalid/expired token.
   - Assert 409 when `sms_consent` is already false.

6. Run `pnpm gate:fast` — must pass.

---

*Generated 2026-05-09 from `docs/operationpipeline` gap analysis. All prompts assume strict TypeScript, no ORM, pnpm gate:fast must pass after each.*
