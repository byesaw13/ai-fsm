import { z } from "zod";
import { loadChangeset } from "./shared.js";
import { checkBusinessRules } from "../rules/business-rules.js";
import { splitFindings } from "../report.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  pr_number: z.number().int().positive().describe("GitHub PR number"),
};
const schema = z.object(inputShape);

export async function run(input: unknown): Promise<unknown> {
  const { pr_number } = schema.parse(input);
  const { changed } = await loadChangeset(pr_number);

  const findings = checkBusinessRules(changed);
  const { blocking, warnings } = splitFindings(findings);

  return {
    blocking_count: blocking.length,
    warning_count: warnings.length,
    findings,
  };
}

export const tool: ToolModule = {
  name: "check_dovetails_business_rules",
  title: "Check Dovetails business rules",
  description:
    "Dovetails-specific safety checks: payment/invoice/Square changes require tests (blocking); new SQL on account-scoped tables must show account_id/RLS scoping (warning); mutating API routes must use withRole/withAuth (blocking).",
  inputShape,
  run,
};

export default tool;
