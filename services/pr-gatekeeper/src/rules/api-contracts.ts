import type { ChangedFile, Finding } from "../types.js";

const ROUTE_RE = /^apps\/web\/app\/api\/.+\/route\.ts$/;

export function isRouteFile(path: string): boolean {
  return ROUTE_RE.test(path);
}

export function isTestFile(path: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(path) || path.includes("/__tests__/");
}

/** A changed non-route client/UI file (page, component) under the web app. */
export function isClientFile(path: string): boolean {
  if (isRouteFile(path) || isTestFile(path)) return false;
  return /^apps\/web\/(app|components)\/.+\.tsx$/.test(path);
}

/**
 * API contract check: a changed/added API route should ship alongside a test or
 * a client update. We keep this a warning — the goal is to flag contract drift,
 * not block reasonable changes.
 */
export function checkApiContracts(changed: ChangedFile[]): Finding[] {
  const findings: Finding[] = [];
  const routes = changed.filter((f) => isRouteFile(f.path) && f.status !== "D");
  if (routes.length === 0) return findings;

  const hasTestChange = changed.some((f) => isTestFile(f.path));
  const hasClientChange = changed.some((f) => isClientFile(f.path));
  if (hasTestChange || hasClientChange) return findings;

  for (const route of routes) {
    findings.push({
      rule: "api-contracts.route-without-test-or-client",
      severity: "warning",
      message:
        "API route changed with no accompanying test or client/UI change in this PR. Confirm the contract change is covered.",
      file: route.path,
    });
  }
  return findings;
}
