import type { ToolModule } from "./types.js";
import analyzePr from "./analyze-pr.js";
import simulateMergeToMain from "./simulate-merge-to-main.js";
import runRepoChecks from "./run-repo-checks.js";
import checkMigrations from "./check-migrations.js";
import checkChangedApiContracts from "./check-changed-api-contracts.js";
import checkDovetailsBusinessRules from "./check-dovetails-business-rules.js";
import generateMergeReport from "./generate-merge-report.js";

/** All gatekeeper tools, in a stable order. */
export const tools: ToolModule[] = [
  analyzePr,
  simulateMergeToMain,
  runRepoChecks,
  checkMigrations,
  checkChangedApiContracts,
  checkDovetailsBusinessRules,
  generateMergeReport,
];

export type { ToolModule };
