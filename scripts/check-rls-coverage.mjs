#!/usr/bin/env node
/**
 * RLS coverage guard: every account-scoped table must have Row-Level Security
 * enabled, so the app can eventually run as the restricted `ai_fsm_web` /
 * `ai_fsm_worker` role (provisioned by scripts/db-provision-runtime.sh) instead
 * of the Postgres superuser, which bypasses RLS entirely.
 *
 * The restricted role is only GRANTed on tables where relrowsecurity is true, so
 * a table without RLS both (a) leaks across accounts if the role is ever flipped
 * without it, and (b) breaks the app the moment the role IS flipped. This check
 * turns the current gap into a burn-down list: tables listed in GRANDFATHERED
 * still lack RLS today; ANY NEW table without RLS fails the build.
 *
 * When you add RLS to a grandfathered table, delete it from the list. When the
 * list is empty, the runtime role can be switched (see next-moves in the
 * TASK-146 audit).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Tables that do NOT yet enable RLS. Now EMPTY — the backfill (migrations
 * 182–185, TASK-146) covers every account-scoped table, so the WEB tier can run
 * as the restricted ai_fsm_web role with RLS enforced. Any NEW table without RLS
 * fails this guard; add `enable row level security` + policies, or, if the table
 * is genuinely global reference data, add it here with a one-line reason.
 *
 * The WORKER is intentionally out of scope for this guard: it is a trusted
 * cross-tenant batch processor (no job sets per-account context; most already
 * query estimates/invoices/visits across accounts) and bypasses RLS by design
 * (superuser today, or a BYPASSRLS ai_fsm_worker role). See migration 185.
 *
 * `_migration_*` internal bookkeeping tables are skipped by pattern, not listed.
 */
export const GRANDFATHERED = new Set([]);

const CREATE_TABLE = /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(?:[a-z_][a-z0-9_]*\.)?"?([a-z_][a-z0-9_]*)"?/i;
const ENABLE_RLS = /^\s*alter\s+table\s+(?:[a-z_][a-z0-9_]*\.)?"?([a-z_][a-z0-9_]*)"?\s+enable\s+row\s+level\s+security/i;
// Literal `create policy <name> on <table>` — global + whitespace-spanning so it
// matches statements where `on <table>` wraps to a later line (a %I dynamic
// target won't match; those are handled by the DO-block/array pass below).
const CREATE_POLICY_ON = /\bcreate\s+policy\s+\S+\s+on\s+(?:[a-z_][a-z0-9_]*\.)?"?([a-z_][a-z0-9_]*)"?/gi;

/** Strip SQL line comments so a commented-out CREATE TABLE never counts. */
function stripComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join("\n");
}

/**
 * @param {string[]} sqls  full text of every migration file
 * @returns {{ created: Set<string>, rlsEnabled: Set<string>, policyTables: Set<string> }}
 */
export function parseTables(sqls) {
  const created = new Set();
  const rlsEnabled = new Set();
  const policyTables = new Set(); // tables that have >= 1 CREATE POLICY
  for (const raw of sqls) {
    const sql = stripComments(raw);
    for (const line of sql.split("\n")) {
      const c = line.match(CREATE_TABLE);
      if (c) created.add(c[1].toLowerCase());
      const r = line.match(ENABLE_RLS);
      if (r) rlsEnabled.add(r[1].toLowerCase());
    }
    // Literal policies — matched over the whole file so `create policy <name>`
    // and its `on <table>` may sit on different lines (see 171_job_store_run.sql).
    for (const p of sql.matchAll(CREATE_POLICY_ON)) policyTables.add(p[1].toLowerCase());
    // Dynamic policies created in a DO-block that loops over `array['t1','t2',…]`
    // and runs `create policy … on %I` per element (see migrations 183/184).
    if (/\bcreate\s+policy/i.test(sql) && /\bforeach\b/i.test(sql)) {
      for (const arr of sql.matchAll(/\barray\s*\[([^\]]+)\]/gi)) {
        for (const q of arr[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi)) {
          policyTables.add(q[1].toLowerCase());
        }
      }
    }
  }
  return { created, rlsEnabled, policyTables };
}

/**
 * @param {{ created: Set<string>, rlsEnabled: Set<string>, policyTables: Set<string> }} tables
 * @param {Set<string>} grandfathered
 * @returns {{ ok: boolean, offenders: string[], enabledNoPolicy: string[], staleAllowlist: string[] }}
 */
export function checkRlsCoverage(tables, grandfathered = GRANDFATHERED) {
  const { created, rlsEnabled, policyTables = new Set() } = tables;
  const withoutRls = [...created].filter(
    (t) => !rlsEnabled.has(t) && !t.startsWith("_migration_"),
  );
  // New tables missing RLS and not grandfathered → hard failure.
  const offenders = withoutRls.filter((t) => !grandfathered.has(t)).sort();
  // RLS enabled but NO policy → Postgres default-deny makes every operation fail
  // under the restricted role, yet the provisioner still grants it (relrowsecurity
  // is true). Enable-without-policy is as broken as no RLS.
  const enabledNoPolicy = [...rlsEnabled]
    .filter((t) => !policyTables.has(t) && !t.startsWith("_migration_"))
    .sort();
  // Allowlist entries that now HAVE rls (or no longer exist) → should be removed.
  const staleAllowlist = [...grandfathered]
    .filter((t) => rlsEnabled.has(t) || !created.has(t))
    .sort();
  return {
    ok: offenders.length === 0 && enabledNoPolicy.length === 0,
    offenders,
    enabledNoPolicy,
    staleAllowlist,
  };
}

export function readMigrationSqls(dir) {
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .map((n) => fs.readFileSync(path.join(dir, n), "utf8"));
}

function isMain() {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return path.resolve(self) === invoked;
}

if (isMain()) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = path.join(repoRoot, "db", "migrations");
  const result = checkRlsCoverage(parseTables(readMigrationSqls(dir)));
  if (result.staleAllowlist.length > 0) {
    console.error("RLS guard: these tables now have RLS — remove from GRANDFATHERED:");
    for (const t of result.staleAllowlist) console.error(`  - ${t}`);
  }
  if (result.offenders.length > 0) {
    console.error("New table(s) without Row-Level Security (TASK-146):");
    for (const t of result.offenders) console.error(`  - ${t}`);
    console.error("Add `alter table <t> enable row level security;` + account-scoped policies,");
    console.error("or, if intentionally global, add it to GRANDFATHERED in this script.");
  }
  if (result.enabledNoPolicy.length > 0) {
    console.error("Table(s) with RLS enabled but NO policy (default-deny — every op fails):");
    for (const t of result.enabledNoPolicy) console.error(`  - ${t}`);
    console.error("Add at least one `create policy … on <t>` (see 003_rls_policies.sql).");
  }
  if (!result.ok || result.staleAllowlist.length > 0) process.exit(1);
  console.log("RLS coverage: ok");
}
