import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** TASK-219: the owner's rate decisions of 2026-10-27, pinned. */
const SQL = readFileSync(join(__dirname, "..", "..", "..", "..", "..", "db", "migrations", "212_production_rate_review.sql"), "utf8");

const DECISIONS: Array<[code: string, key: string, from: number, to: number]> = [
  ["2001", "fixture_count", 6, 7],
  ["2005", "fixture_count", 3, 4],
  ["2006", "fixture_count", 6, 9],
  ["4007", "piece_count", 5, 6],
  ["4009", "piece_count", 4, 12.5],
  ["5002", "door_count", 6, 9],
  ["5003", "trim_linear_ft", 120, 470],
  ["9013", "sqft", 300, 410],
];

const live = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
const statements = live.split(/;\s*$/m).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 212 production rate review", () => {
  it("changes exactly the eight owner-decided rates", () => {
    expect(statements).toHaveLength(DECISIONS.length);
  });

  it.each(DECISIONS)("%s %s: %d -> %d, guarded on the seeded value, with a review note", (code, key, from, to) => {
    const stmt = statements.find((s) => s.includes(`service_code = '${code}'`));
    expect(stmt).toBeDefined();
    expect(stmt).toContain(`SET base_rate = ${to},`);
    expect(stmt).toContain(`scope_component_key = '${key}' AND base_rate = ${from}`);
    expect(stmt).toMatch(/notes = notes \|\| ' Reviewed 2026-10-27 against Craftsman/);
  });

  it("never marks a rate calibrated", () => {
    expect(live).not.toMatch(/calibrated/);
  });
});
