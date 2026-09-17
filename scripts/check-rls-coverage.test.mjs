import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTables, checkRlsCoverage } from "./check-rls-coverage.mjs";

test("parseTables ignores commented-out CREATE TABLE and reads RLS", () => {
  const { created, rlsEnabled } = parseTables([
    "-- CREATE TABLE ghost (id uuid);\nCREATE TABLE real_one (id uuid);",
    "alter table real_one enable row level security;",
  ]);
  assert.ok(created.has("real_one"));
  assert.ok(!created.has("ghost"));
  assert.ok(rlsEnabled.has("real_one"));
});

test("parseTables handles IF NOT EXISTS and schema-qualified names", () => {
  const { created } = parseTables([
    'CREATE TABLE IF NOT EXISTS public."quoted_tbl" (id uuid);',
  ]);
  assert.ok(created.has("quoted_tbl"));
});

test("a new table without RLS fails, unless grandfathered", () => {
  const tables = { created: new Set(["newtbl"]), rlsEnabled: new Set() };
  assert.equal(checkRlsCoverage(tables, new Set()).ok, false);
  assert.equal(checkRlsCoverage(tables, new Set(["newtbl"])).ok, true);
});

test("_migration_* internal tables are exempt by pattern", () => {
  const tables = { created: new Set(["_migration_161_ignored"]), rlsEnabled: new Set() };
  assert.equal(checkRlsCoverage(tables, new Set()).ok, true);
});

test("a grandfathered table that gained RLS is flagged stale", () => {
  const tables = { created: new Set(["done"]), rlsEnabled: new Set(["done"]), policyTables: new Set(["done"]) };
  const res = checkRlsCoverage(tables, new Set(["done"]));
  assert.deepEqual(res.staleAllowlist, ["done"]);
});

test("RLS enabled but no policy fails (default-deny)", () => {
  const noPolicy = { created: new Set(["t"]), rlsEnabled: new Set(["t"]), policyTables: new Set() };
  const r1 = checkRlsCoverage(noPolicy, new Set());
  assert.equal(r1.ok, false);
  assert.deepEqual(r1.enabledNoPolicy, ["t"]);
  const withPolicy = { created: new Set(["t"]), rlsEnabled: new Set(["t"]), policyTables: new Set(["t"]) };
  assert.equal(checkRlsCoverage(withPolicy, new Set()).ok, true);
});

test("parseTables detects literal and DO-block (array) policies", () => {
  const { created, rlsEnabled, policyTables } = parseTables([
    "create table a (id uuid);\nalter table a enable row level security;\ncreate policy a_sel on a for select using (true);",
    "create table b (id uuid);\nalter table b enable row level security;\n" +
      "do $$ declare t text; begin foreach t in array array['b'] loop " +
      "execute format($f$create policy %1$s_sel on %1$I for select using (true)$f$, t); end loop; end $$;",
  ]);
  assert.ok(created.has("a") && created.has("b"));
  assert.ok(rlsEnabled.has("a") && rlsEnabled.has("b"));
  assert.ok(policyTables.has("a"), "literal policy detected");
  assert.ok(policyTables.has("b"), "DO-block array policy detected");
});

test("real migrations pass the guard (coverage + policies + allowlist)", async () => {
  const { readMigrationSqls } = await import("./check-rls-coverage.mjs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
  const res = checkRlsCoverage(parseTables(readMigrationSqls(dir)));
  assert.deepEqual(res.offenders, []);
  assert.deepEqual(res.enabledNoPolicy, []);
  assert.deepEqual(res.staleAllowlist, []);
});
