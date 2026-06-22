import type { ChangedFile, Finding } from "../types.js";
import { checkMigrations, migrationNumber } from "./migrations.js";
import { checkApiContracts } from "./api-contracts.js";
import { checkBusinessRules } from "./business-rules.js";

export { checkMigrations, migrationNumber } from "./migrations.js";
export { checkApiContracts, isRouteFile, isTestFile } from "./api-contracts.js";
export { checkBusinessRules } from "./business-rules.js";

export interface RuleInput {
  changed: ChangedFile[];
  /** All migration filenames at the PR head, for duplicate detection. */
  allMigrationFiles: string[];
}

/** Run every rule check and return the combined findings. */
export function runAllRules({ changed, allMigrationFiles }: RuleInput): Finding[] {
  return [
    ...checkMigrations({ allMigrationFiles, changed }),
    ...checkApiContracts(changed),
    ...checkBusinessRules(changed),
  ];
}

export function migrationFilesFromChanged(changed: ChangedFile[]): string[] {
  return changed.filter((f) => migrationNumber(f.path) !== null).map((f) => f.path);
}
