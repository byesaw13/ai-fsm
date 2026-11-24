/**
 * Backfill the price ledger (TASK-210). Dry run by default.
 *
 *   cd apps/web
 *   DATABASE_URL=postgres://... npx -y tsx@4.19.2 --tsconfig tsconfig.json scripts/backfill-price-observations.ts           # dry run
 *   DATABASE_URL=postgres://... npx -y tsx@4.19.2 --tsconfig tsconfig.json scripts/backfill-price-observations.ts --apply   # write
 *
 * Dry run: everything in one transaction, report, then ROLLBACK.
 * Apply: the catalog cache as it was is saved to price-cache-before-<runId>.json
 * (in the current directory), then the backfill commits. The output prints the
 * SQL that removes this run's rows and restores the cache.
 */
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { backfillPriceObservations } from "../lib/materials/backfill";

type CacheRow = {
  id: string;
  unit_cost_cents: number;
  avg_paid_cents: number | null;
  purchase_count: number;
  last_purchased_at: string | null;
};

async function cacheSnapshot(client: Client): Promise<CacheRow[]> {
  const { rows } = await client.query<CacheRow>(
    `SELECT id, unit_cost_cents, avg_paid_cents, purchase_count, last_purchased_at::text AS last_purchased_at
     FROM materials_price_book ORDER BY id`,
  );
  return rows;
}

function diff(before: CacheRow[], after: CacheRow[]) {
  const was = new Map(before.map((r) => [r.id, r]));
  let price = 0;
  let avg = 0;
  let count = 0;
  let last = 0;
  const samples: string[] = [];
  for (const r of after) {
    const b = was.get(r.id);
    if (!b) continue;
    const changed: string[] = [];
    if (b.unit_cost_cents !== r.unit_cost_cents) { price++; changed.push(`price ${b.unit_cost_cents}→${r.unit_cost_cents}`); }
    if (b.avg_paid_cents !== r.avg_paid_cents) { avg++; changed.push(`avg ${b.avg_paid_cents}→${r.avg_paid_cents}`); }
    if (b.purchase_count !== r.purchase_count) { count++; changed.push(`count ${b.purchase_count}→${r.purchase_count}`); }
    if (b.last_purchased_at !== r.last_purchased_at) { last++; changed.push(`last ${b.last_purchased_at}→${r.last_purchased_at}`); }
    if (changed.length && samples.length < 15) samples.push(`  ${r.id}: ${changed.join(", ")}`);
  }
  return { price, avg, count, last, samples };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const runIdArg = process.argv.find((a) => a.startsWith("--run-id="));
  const runId = runIdArg ? runIdArg.split("=")[1] : `pl-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    const before = await cacheSnapshot(client);
    const accounts = await client.query<{ id: string }>(`SELECT id FROM accounts ORDER BY id`);
    for (const a of accounts.rows) {
      // PoolClient and Client share the query surface the backfill uses.
      const report = await backfillPriceObservations(client as never, a.id, runId);
      console.log(`account ${a.id}: ${JSON.stringify(report)}`);
    }
    const after = await cacheSnapshot(client);
    const d = diff(before, after);
    console.log(`cache changes: price ${d.price}, average ${d.avg}, purchase count ${d.count}, last purchased ${d.last}`);
    if (d.samples.length) console.log(`examples:\n${d.samples.join("\n")}`);

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(`DRY RUN (run id ${runId}): nothing written. Re-run with --apply to write.`);
      return;
    }
    const file = `price-cache-before-${runId}.json`;
    writeFileSync(file, JSON.stringify(before));
    await client.query("COMMIT");
    console.log(`APPLIED run ${runId}. Cache before the run saved to ${file}.`);
    console.log(`Cleanup (removes this run's rows; restore the cache from ${file}):`);
    console.log(`  DELETE FROM price_observations WHERE note = 'backfill:${runId}';`);
    console.log(`  -- for each row in ${file}:`);
    console.log(`  UPDATE materials_price_book SET unit_cost_cents = $2, avg_paid_cents = $3, purchase_count = $4, last_purchased_at = $5::date WHERE id = $1;`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
