import { Client } from "pg";
import { runVisitReminders } from "./visit-reminder.js";
import { runInvoiceFollowups } from "./invoice-followup.js";
import { runBookingConfirmations } from "./booking-confirmed.js";
import { runReviewRequests } from "./review-request.js";
import { runEstimateFollowups } from "./estimate-followup.js";
import { runRenewalNudges } from "./membership-renewal-nudge.js";
import { runStaleJobNudges } from "./stale-job-nudge.js";
import { runPropertyIssueScans } from "./property-issue-scan.js";
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

      // Dispatch estimate follow-ups
      const estimateResults = await runEstimateFollowups(client);
      if (estimateResults.length > 0) {
        const totalSent = estimateResults.reduce((sum, r) => sum + r.sent, 0);
        logger.info("estimate-followup dispatch complete", {
          automations: estimateResults.length,
          sent: totalSent,
          skipped: estimateResults.reduce((sum, r) => sum + r.skipped, 0),
          errors: estimateResults.reduce((sum, r) => sum + r.errors, 0),
        });
      }

      // Dispatch membership renewal nudges
      const renewalResults = await runRenewalNudges(client);
      if (renewalResults.length > 0) {
        const totalSent = renewalResults.reduce((sum, r) => sum + r.sent, 0);
        logger.info("membership-renewal-nudge dispatch complete", {
          automations: renewalResults.length,
          sent: totalSent,
          skipped: renewalResults.reduce((sum, r) => sum + r.skipped, 0),
          errors: renewalResults.reduce((sum, r) => sum + r.errors, 0),
        });
      }

      // Dispatch stale job nudges (internal alerts)
      const staleResults = await runStaleJobNudges(client);
      if (staleResults.length > 0) {
        const totalFlagged = staleResults.reduce((sum, r) => sum + r.sent, 0);
        logger.info("stale-job-nudge dispatch complete", {
          automations: staleResults.length,
          flagged: totalFlagged,
          errors: staleResults.reduce((sum, r) => sum + r.errors, 0),
        });
      }

      // Scan for recurring property issues
      const issueResults = await runPropertyIssueScans(client);
      if (issueResults.length > 0) {
        const totalUpserted = issueResults.reduce((sum, r) => sum + r.sent, 0);
        logger.info("property-issue-scan complete", {
          automations: issueResults.length,
          upserted: totalUpserted,
          errors: issueResults.reduce((sum, r) => sum + r.errors, 0),
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
