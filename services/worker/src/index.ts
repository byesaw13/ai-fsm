import { Client } from "pg";
import { runInvoiceFollowups } from "./invoice-followup.js";

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
    console.log("automation poll", { due: dueCount, at: new Date().toISOString() });

    if (dueCount > 0) {
      // Dispatch invoice follow-ups
      const followupResults = await runInvoiceFollowups(client);
      if (followupResults.length > 0) {
        const totalSent = followupResults.reduce((sum, r) => sum + r.sent, 0);
        const totalSkipped = followupResults.reduce((sum, r) => sum + r.skipped, 0);
        const totalErrors = followupResults.reduce((sum, r) => sum + r.errors, 0);
        console.log("invoice-followup dispatch complete", {
          automations: followupResults.length,
          sent: totalSent,
          skipped: totalSkipped,
          errors: totalErrors,
        });
      }
    }
  } catch (error) {
    console.error("worker poll failed", error);
  }
}

async function run() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log("worker started", { pollMs });

  // Run immediately on start, then on interval
  await runPollIteration(client);

  setInterval(() => {
    runPollIteration(client);
  }, pollMs);
}

run().catch((error) => {
  console.error("worker boot failed", error);
  process.exit(1);
});

// Export for testing
export { runPollIteration };
