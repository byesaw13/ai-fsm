import { Client } from "pg";

const pollMs = Number(process.env.WORKER_POLL_MS ?? "30000");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

async function run() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log("worker started", { pollMs });

  setInterval(async () => {
    try {
      const { rows } = await client.query(
        `select count(*)::int as due_count from automations where enabled = true and next_run_at <= now()`
      );
      console.log("automation poll", { due: rows[0]?.due_count ?? 0, at: new Date().toISOString() });
    } catch (error) {
      console.error("worker poll failed", error);
    }
  }, pollMs);
}

run().catch((error) => {
  console.error("worker boot failed", error);
  process.exit(1);
});
