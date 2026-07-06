import { Client } from "pg";
import { runAllDueAutomations } from "./automations/runner.js";
import { expireEstimates } from "./expire-estimates.js";
import { pruneLocationEvents } from "./prune-location-events.js";
import { processWorkflowEvents } from "./workflow-events.js";
import { dispatchNotificationQueue } from "./notification/dispatch.js";
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
      await runAllDueAutomations(client);
    }

    // Process workflow events (cancel pending notifications on state changes)
    const processedEvents = await processWorkflowEvents(client);
    if (processedEvents > 0) {
      logger.info("workflow-events processed", { count: processedEvents });
    }

    // Dispatch notification queue (send emails from the queue)
    const dispatchResult = await dispatchNotificationQueue(client);
    const dispatchTotal = dispatchResult.sent + dispatchResult.failed + dispatchResult.retried + dispatchResult.delayed + dispatchResult.cancelled;
    if (dispatchTotal > 0) {
      logger.info("notification-queue dispatched", { ...dispatchResult });
    }

    // Expire sent estimates whose expiry date has passed
    const expireResult = await expireEstimates(client);
    if (expireResult.expired > 0) {
      logger.info("expire-estimates complete", { expired: expireResult.expired });
    }

    const pruneResult = await pruneLocationEvents(client);
    if (pruneResult.deleted > 0) {
      logger.info("prune-location-events complete", { deleted: pruneResult.deleted });
    }
  } catch (error) {
    logger.error("worker poll failed", error);
    const msg = (error as Error)?.message ?? "";
    if (
      msg.includes("connection error") ||
      msg.includes("not queryable") ||
      msg.includes("Connection terminated")
    ) {
      throw error;
    }
  }
}

function makeClient(): Client {
  const c = new Client({ connectionString: databaseUrl });
  c.on("error", (err) => logger.error("db client error", err));
  return c;
}

async function run() {
  let client = makeClient();
  await client.connect();

  logger.info("worker started", { pollMs });

  async function tick() {
    try {
      await runPollIteration(client);
    } catch (err) {
      logger.error("worker tick failed", err);
      // Reconnect on connection-level errors so the interval keeps running
      const msg = (err as Error)?.message ?? "";
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (
        code === "ECONNRESET" ||
        code === "ECONNREFUSED" ||
        code === "EPIPE" ||
        msg.includes("connection error") ||
        msg.includes("not queryable") ||
        msg.includes("Connection terminated")
      ) {
        try { await client.end(); } catch { /* ignore */ }
        client = makeClient();
        await client.connect();
        logger.info("worker db reconnected");
      }
    }
  }

  // Run immediately on start, then on interval
  await tick();

  setInterval(() => {
    tick();
  }, pollMs);
}

run().catch((error) => {
  logger.error("worker boot failed", error);
  process.exit(1);
});

// Export for testing
export { runPollIteration };