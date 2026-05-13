import { Client } from "pg";
import { runVisitReminders } from "./visit-reminder.js";
import { runInvoiceFollowups } from "./invoice-followup.js";
import { runBookingConfirmations } from "./booking-confirmed.js";
import { runReviewRequests } from "./review-request.js";
import { processMaintenanceScheduling } from "./maintenance-scheduling.js";
import { expireEstimates } from "./expire-estimates.js";
import { logger } from "./logger.js";

const pollMs = Number(process.env.WORKER_POLL_MS ?? "30000");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

async function runPollIteration(client: Client): Promise<void> {
  try {
    // Count due automations for observability
    const { rows } = await client.query(
      `select count(*)::int as due_count from automations where enabled = true and next_run_at <= now()`
    );
    const dueCount = rows[0]?.due_count ?? 0;
    logger.info("automation poll", { due: dueCount });

    if (dueCount > 0) {
      // Dispatch visit reminders
      const visitReminderResults = await runVisitReminders(client);
      if (visitReminderResults.length > 0) {
        const totalSent = visitReminderResults.reduce((sum, r) => sum + r.sent, 0);
        const totalSkipped = visitReminderResults.reduce((sum, r) => sum + r.skipped, 0);
        const totalErrors = visitReminderResults.reduce((sum, r) => sum + r.errors, 0);
        logger.info("visit-reminder dispatch complete", {
          automations: visitReminderResults.length,
          sent: totalSent,
          skipped: totalSkipped,
          errors: totalErrors,
        });
      }

      // Dispatch invoice follow-ups
      const followupResults = await runInvoiceFollowups(client);
      if (followupResults.length > 0) {
        const totalSent = followupResults.reduce((sum, r) => sum + r.sent, 0);
        const totalSkipped = followupResults.reduce((sum, r) => sum + r.skipped, 0);
        const totalErrors = followupResults.reduce((sum, r) => sum + r.errors, 0);
        logger.info("invoice-followup dispatch complete", {
          automations: followupResults.length,
          sent: totalSent,
          skipped: totalSkipped,
          errors: totalErrors,
        });
      }

      // Dispatch booking confirmations
      const bookingResults = await runBookingConfirmations(client);
      if (bookingResults.length > 0) {
        const totalSent = bookingResults.reduce((sum, r) => sum + r.sent, 0);
        const totalSkipped = bookingResults.reduce((sum, r) => sum + r.skipped, 0);
        const totalErrors = bookingResults.reduce((sum, r) => sum + r.errors, 0);
        logger.info("booking-confirmed dispatch complete", {
          automations: bookingResults.length,
          sent: totalSent,
          skipped: totalSkipped,
          errors: totalErrors,
        });
      }

      // Dispatch review requests
      const reviewResults = await runReviewRequests(client);
      if (reviewResults.length > 0) {
        const totalSent = reviewResults.reduce((sum, r) => sum + r.sent, 0);
        const totalSkipped = reviewResults.reduce((sum, r) => sum + r.skipped, 0);
        const totalErrors = reviewResults.reduce((sum, r) => sum + r.errors, 0);
        logger.info("review-request dispatch complete", {
          automations: reviewResults.length,
          sent: totalSent,
          skipped: totalSkipped,
          errors: totalErrors,
        });
      }
    }

    // Expire sent estimates whose expiry date has passed
    const expireResult = await expireEstimates(client);
    if (expireResult.expired > 0) {
      logger.info("expire-estimates complete", { expired: expireResult.expired });
    }

    // Process maintenance plans independently (not automation-based)
    const maintenanceResults = await processMaintenanceScheduling(client);
    if (maintenanceResults.length > 0) {
      const totalCreated = maintenanceResults.filter((r) => r.action === "created").length;
      const totalErrors = maintenanceResults.filter((r) => r.action === "error").length;
      logger.info("maintenance-scheduling dispatch complete", {
        plans: maintenanceResults.length,
        created: totalCreated,
        errors: totalErrors,
      });
    }
  } catch (error) {
    logger.error("worker poll failed", error);
  }
}

async function run() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  logger.info("worker started", { pollMs });

  // Run immediately on start, then on interval
  await runPollIteration(client);

  setInterval(() => {
    runPollIteration(client);
  }, pollMs);
}

run().catch((error) => {
  logger.error("worker boot failed", error);
  process.exit(1);
});

// Export for testing
export { runPollIteration };
