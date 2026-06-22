import type { ChangedFile, Finding } from "../types.js";
import { isTestFile } from "./api-contracts.js";

// ---------------------------------------------------------------------------
// 1. Payment / invoice / Square changes require tests
// ---------------------------------------------------------------------------

const SENSITIVE_RE = /(invoice|payment|square|billing|refund)/i;

export function isSensitiveBusinessFile(path: string): boolean {
  if (isTestFile(path)) return false;
  if (!/\.(ts|tsx)$/.test(path)) return false;
  if (!/^(apps\/web|services\/worker|packages\/domain)\//.test(path)) return false;
  return SENSITIVE_RE.test(path);
}

function checkSensitiveTests(changed: ChangedFile[]): Finding[] {
  const sensitive = changed.filter((f) => f.status !== "D" && isSensitiveBusinessFile(f.path));
  if (sensitive.length === 0) return [];
  const hasTest = changed.some((f) => isTestFile(f.path));
  if (hasTest) return [];
  return [
    {
      rule: "business.payment-change-without-tests",
      severity: "blocking",
      message: `Payment/invoice/Square code changed (${sensitive
        .map((f) => f.path)
        .join(", ")}) with no test changes in this PR. Add or update tests for this money-handling change.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 2. Missing account_id scoping in new SQL
// ---------------------------------------------------------------------------

const ACCOUNT_SCOPED_TABLES = [
  "clients",
  "properties",
  "jobs",
  "visits",
  "estimates",
  "estimate_line_items",
  "invoices",
  "invoice_line_items",
  "payments",
  "automations",
  "audit_log",
  "activity_entries",
  "expenses",
  "mileage_logs",
  "booking_requests",
  "change_orders",
  "vehicles",
  "vehicle_sessions",
  "property_issues",
  "property_notes",
];

/** Helpers that establish account scope (RLS context or explicit predicate). */
const SCOPE_MARKERS = [
  "account_id",
  "app_account_id",
  "current_account_id",
  "queryForSession",
  "queryOneForSession",
  "withDbSession",
  "withInvoiceContext",
  "withEstimateContext",
  "withExpenseContext",
  "withReportContext",
  "withAssetContext",
  "withDocumentContext",
  "withChecklistContext",
];

export function referencedScopedTable(line: string): string | null {
  for (const table of ACCOUNT_SCOPED_TABLES) {
    const re = new RegExp(`\\b(from|join|update|into)\\s+["'\`]?${table}\\b`, "i");
    if (re.test(line)) return table;
  }
  return null;
}

function checkAccountScoping(changed: ChangedFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of changed) {
    if (file.status === "D") continue;
    if (!/\.(ts|tsx)$/.test(file.path)) continue;
    if (isTestFile(file.path)) continue;
    if (file.path.startsWith("db/migrations/")) continue;

    const tablesHit = new Set<string>();
    let firstLine: number | undefined;
    for (const added of file.addedLines) {
      const table = referencedScopedTable(added.text);
      if (table) {
        tablesHit.add(table);
        if (firstLine === undefined) firstLine = added.line;
      }
    }
    if (tablesHit.size === 0) continue;

    // If the file establishes scope anywhere, assume the new SQL is covered.
    const scoped = SCOPE_MARKERS.some((m) => file.content.includes(m));
    if (scoped) continue;

    findings.push({
      rule: "business.sql-missing-account-scope",
      severity: "warning",
      message: `New SQL references account-scoped table(s) ${[...tablesHit].join(
        ", ",
      )} but the file shows no account_id predicate or session/RLS context. Verify tenant scoping.`,
      file: file.path,
      line: firstLine,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 3. Owner/admin-protected (mutating) routes missing withRole / withAuth
// ---------------------------------------------------------------------------

const ROUTE_RE = /^apps\/web\/app\/api\/(.+)\/route\.ts$/;

// Paths that legitimately authenticate by token/webhook/public instead of a
// session role guard.
const PUBLIC_PREFIXES = [
  "webhooks/",
  "portal/",
  "intake/",
  "booking",
  "internal/",
  "health",
  "v1/auth/",
  "v1/portal/",
];

export function routeSubPath(path: string): string | null {
  const m = ROUTE_RE.exec(path);
  return m ? m[1] : null;
}

export function isPublicRoute(subPath: string): boolean {
  return PUBLIC_PREFIXES.some((p) => subPath === p || subPath.startsWith(p));
}

const MUTATING_EXPORT_RE = /export\s+const\s+(POST|PUT|PATCH|DELETE)\b/;
const READ_EXPORT_RE = /export\s+const\s+GET\b/;

function checkRouteGuards(changed: ChangedFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of changed) {
    if (file.status === "D") continue;
    const subPath = routeSubPath(file.path);
    if (subPath === null) continue;
    if (isPublicRoute(subPath)) continue;

    const guarded = file.content.includes("withRole(") || file.content.includes("withAuth(");
    if (guarded) continue;

    if (MUTATING_EXPORT_RE.test(file.content)) {
      findings.push({
        rule: "business.route-missing-role-guard",
        severity: "blocking",
        message:
          "Mutating API route exports POST/PUT/PATCH/DELETE without withRole/withAuth. Owner/admin actions must be wrapped in withRole([...]).",
        file: file.path,
      });
    } else if (READ_EXPORT_RE.test(file.content)) {
      findings.push({
        rule: "business.read-route-unguarded",
        severity: "warning",
        message:
          "API route exports GET without withRole/withAuth and is not a public/portal/webhook path. Confirm this data is meant to be unauthenticated.",
        file: file.path,
      });
    }
  }
  return findings;
}

/** Run all Dovetails business-rule checks over the PR's changed files. */
export function checkBusinessRules(changed: ChangedFile[]): Finding[] {
  return [
    ...checkSensitiveTests(changed),
    ...checkAccountScoping(changed),
    ...checkRouteGuards(changed),
  ];
}
