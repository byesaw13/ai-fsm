import { z } from "zod";
import { loadChangeset } from "./shared.js";
import { checkApiContracts, isRouteFile } from "../rules/api-contracts.js";
import { splitFindings } from "../report.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  pr_number: z.number().int().positive().describe("GitHub PR number"),
};
const schema = z.object(inputShape);

export async function run(input: unknown): Promise<unknown> {
  const { pr_number } = schema.parse(input);
  const { changed } = await loadChangeset(pr_number);

  const findings = checkApiContracts(changed);
  const { blocking, warnings } = splitFindings(findings);

  return {
    routes_changed: changed.filter((f) => isRouteFile(f.path)).map((f) => ({ path: f.path, status: f.status })),
    blocking_count: blocking.length,
    warning_count: warnings.length,
    findings,
  };
}

export const tool: ToolModule = {
  name: "check_changed_api_contracts",
  title: "Check changed API contracts",
  description:
    "Flag API route files changed without an accompanying test or client/UI change in the same PR (warning), to catch contract drift.",
  inputShape,
  run,
};

export default tool;
