import { z } from "zod";
import { loadChangeset } from "./shared.js";
import { checkMigrations, migrationNumber } from "../rules/migrations.js";
import { splitFindings } from "../report.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  pr_number: z.number().int().positive().describe("GitHub PR number"),
};
const schema = z.object(inputShape);

export async function run(input: unknown): Promise<unknown> {
  const { pr_number } = schema.parse(input);
  const { changed, allMigrationFiles } = await loadChangeset(pr_number);

  const findings = checkMigrations({ allMigrationFiles, changed });
  const { blocking, warnings } = splitFindings(findings);
  const migrationsChanged = changed
    .filter((f) => migrationNumber(f.path) !== null)
    .map((f) => ({ path: f.path, status: f.status }));

  return {
    migrations_changed: migrationsChanged,
    blocking_count: blocking.length,
    warning_count: warnings.length,
    findings,
  };
}

export const tool: ToolModule = {
  name: "check_migrations",
  title: "Check migrations",
  description:
    "Detect duplicate migration numbers (blocking) and destructive statements such as DROP/TRUNCATE/DELETE in changed migrations (warning).",
  inputShape,
  run,
};

export default tool;
