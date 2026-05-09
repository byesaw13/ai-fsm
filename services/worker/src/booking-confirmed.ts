import type { Client } from "pg";
import { logger } from "./logger.js";
import { sendEmail, isEmailConfigured, bookingConfirmedHtml } from "./mailer.js";
import type { AutomationRow, ReminderResult } from "./visit-reminder.js";
import { logWorkerCommunication } from "./communications-log.js";

/**
 * Booking Confirmation Automation
 *
 * When a visit is newly scheduled, sends the client a confirmation email with
 * the appointment details. Fires once per visit — idempotency via audit_log.
 *
 * A visit is eligible if:
 * 1. Status is 'scheduled' (not yet started/completed/cancelled)
 * 2. scheduled_start is in the future
 * 3. Created within the last 48 hours (so we don't spam old unconfirmed visits)
 * 4. No 'booking_confirmed' audit entry exists for this visit yet
 */

interface EligibleBooking {
  id: string;
  account_id: string;
  job_id: string;
  client_id: string;
  scheduled_start: string;
  scheduled_end: string;
  job_title: string | null;
  client_name: string | null;
  client_email: string | null;
  property_address: string | null;
  tech_name: string | null;
}

export async function findDueBookingConfirmations(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
     FROM automations
     WHERE type = 'booking_confirmed'
       AND enabled = true
       AND next_run_at <= now()`
  );
  return rows;
}

export async function findEligibleBookings(
  client: Client,
  automation: AutomationRow
): Promise<EligibleBooking[]> {
  const hoursWindow = (automation.config as { hours_window?: number }).hours_window ?? 48;

  const { rows } = await client.query<EligibleBooking>(
    `SELECT v.id, v.account_id, v.job_id, c.id AS client_id,
            v.scheduled_start::text, v.scheduled_end::text,
            j.title AS job_title,
            c.name AS client_name, c.email AS client_email,
            p.address AS property_address,
            u.full_name AS tech_name
     FROM visits v
     JOIN jobs j ON j.id = v.job_id
     JOIN clients c ON c.id = j.client_id
     LEFT JOIN properties p ON p.id = j.property_id
     LEFT JOIN users u ON u.id = v.assigned_user_id
     WHERE v.account_id = $1
       AND v.status = 'scheduled'
       AND v.scheduled_start > now()
       AND v.created_at >= now() - ($2 || ' hours')::interval
       AND NOT EXISTS (
         SELECT 1 FROM audit_log al
         WHERE al.entity_type = 'booking_confirmed'
           AND al.entity_id = v.id
           AND al.account_id = v.account_id
       )
     ORDER BY v.created_at ASC`,
    [automation.account_id, hoursWindow]
  );

  return rows;
}

async function emitBookingConfirmation(
  client: Client,
  booking: EligibleBooking,
  automationId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
     WHERE entity_type = 'booking_confirmed'
       AND entity_id = $1
       AND account_id = $2
     LIMIT 1`,
    [booking.id, booking.account_id]
  );

  if (rowCount && rowCount > 0) {
    return false;
  }

  if (isEmailConfigured() && booking.client_email && booking.client_name && booking.job_title) {
    const emailResult = await sendEmail({
      to: booking.client_email,
      subject: `Appointment Confirmed — ${booking.job_title}`,
      html: bookingConfirmedHtml({
        clientName: booking.client_name,
        jobTitle: booking.job_title,
        scheduledStart: booking.scheduled_start,
        scheduledEnd: booking.scheduled_end,
        propertyAddress: booking.property_address,
        techName: booking.tech_name,
      }),
    });
    if (!emailResult.ok) {
      await logWorkerCommunication(client, {
        accountId: booking.account_id,
        channel: "email",
        direction: "outbound",
        outcome: "failed",
        clientId: booking.client_id,
        jobId: booking.job_id,
        visitId: booking.id,
        bodyPreview: `Appointment Confirmed — ${booking.job_title}`,
        externalId: automationId,
      });
      logger.warn("booking-confirmed: email send failed", { visitId: booking.id, error: emailResult.error });
      return false;
    }
    await logWorkerCommunication(client, {
      accountId: booking.account_id,
      channel: "email",
      direction: "outbound",
      outcome: "sent",
      clientId: booking.client_id,
      jobId: booking.job_id,
      visitId: booking.id,
      bodyPreview: `Appointment Confirmed — ${booking.job_title}`,
      externalId: automationId,
    });
  }

  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'booking_confirmed', $2, 'insert', $3, NULL, $4)`,
    [
      booking.account_id,
      booking.id,
      automationId,
      JSON.stringify({
        automation_id: automationId,
        scheduled_start: booking.scheduled_start,
        job_title: booking.job_title,
        client_name: booking.client_name,
        confirmed_at: new Date().toISOString(),
      }),
    ]
  );

  return true;
}

async function processBookingConfirmation(
  client: Client,
  automation: AutomationRow
): Promise<ReminderResult> {
  const result: ReminderResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const bookings = await findEligibleBookings(client, automation);

  for (const booking of bookings) {
    try {
      const emitted = await emitBookingConfirmation(client, booking, automation.id);
      if (emitted) {
        result.sent++;
      } else {
        result.skipped++;
      }
    } catch (error) {
      result.errors++;
      logger.error("booking-confirmed: failed to emit", error, { visitId: booking.id });
    }
  }

  await client.query(
    `UPDATE automations
     SET last_run_at = now(),
         next_run_at = now() + interval '30 minutes',
         updated_at = now()
     WHERE id = $1`,
    [automation.id]
  );

  return result;
}

export async function runBookingConfirmations(client: Client): Promise<ReminderResult[]> {
  const automations = await findDueBookingConfirmations(client);
  const results: ReminderResult[] = [];

  for (const automation of automations) {
    try {
      const result = await processBookingConfirmation(client, automation);
      results.push(result);
      logger.info("booking-confirmed: processed", {
        automationId: automation.id,
        accountId: automation.account_id,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      logger.error("booking-confirmed: failed to process automation", error, { automationId: automation.id });
    }
  }

  return results;
}
