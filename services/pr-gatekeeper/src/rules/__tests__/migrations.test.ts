import { describe, it, expect } from "vitest";
import { checkMigrations, migrationNumber } from "../migrations.js";
import { file } from "./helpers.js";

describe("migrationNumber", () => {
  it("extracts the numeric prefix", () => {
    expect(migrationNumber("db/migrations/117_payments.sql")).toBe("117");
    expect(migrationNumber("db/migrations/007_expenses.sql")).toBe("007");
    expect(migrationNumber("apps/web/foo.ts")).toBeNull();
  });
});

describe("checkMigrations — duplicate numbers", () => {
  it("flags a duplicate number when a changed migration collides (blocking)", () => {
    const findings = checkMigrations({
      allMigrationFiles: ["db/migrations/120_a.sql", "db/migrations/120_b.sql"],
      changed: [file("db/migrations/120_b.sql", { status: "A", added: ["create table x();"] })],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("migrations.duplicate-number");
    expect(findings[0].severity).toBe("blocking");
    expect(findings[0].message).toContain("120");
  });

  it("does not flag when numbers are unique", () => {
    const findings = checkMigrations({
      allMigrationFiles: ["db/migrations/119_a.sql", "db/migrations/120_b.sql"],
      changed: [file("db/migrations/120_b.sql", { status: "A", added: ["alter table x add column y int;"] })],
    });
    expect(findings.filter((f) => f.rule === "migrations.duplicate-number")).toHaveLength(0);
  });

  it("ignores duplicates that don't involve a changed migration", () => {
    const findings = checkMigrations({
      allMigrationFiles: ["db/migrations/100_a.sql", "db/migrations/100_b.sql"],
      changed: [file("apps/web/foo.ts", { added: ["const x = 1;"] })],
    });
    expect(findings).toHaveLength(0);
  });
});

describe("checkMigrations — destructive statements", () => {
  it("warns on DROP TABLE / DROP COLUMN / TRUNCATE / DELETE in added lines", () => {
    const findings = checkMigrations({
      allMigrationFiles: ["db/migrations/121_x.sql"],
      changed: [
        file("db/migrations/121_x.sql", {
          status: "A",
          added: [
            "drop table old_things;",
            "ALTER TABLE jobs DROP COLUMN legacy;",
            "truncate audit_log;",
          ],
        }),
      ],
    });
    const destructive = findings.filter((f) => f.rule === "migrations.destructive");
    expect(destructive.length).toBe(3);
    expect(destructive.every((f) => f.severity === "warning")).toBe(true);
  });

  it("ignores destructive statements inside SQL line comments (rollback notes)", () => {
    const findings = checkMigrations({
      allMigrationFiles: ["db/migrations/123_x.sql"],
      changed: [
        file("db/migrations/123_x.sql", {
          status: "A",
          added: [
            "alter table payments add column note text;",
            "-- Rollback:",
            "-- DROP TABLE payments;",
            "-- ALTER TABLE payments DROP COLUMN note;",
          ],
        }),
      ],
    });
    expect(findings).toHaveLength(0);
  });

  it("does not warn on additive-only migrations", () => {
    const findings = checkMigrations({
      allMigrationFiles: ["db/migrations/122_x.sql"],
      changed: [
        file("db/migrations/122_x.sql", {
          status: "A",
          added: ["create table new_things (id uuid primary key);", "alter table jobs add column note text;"],
        }),
      ],
    });
    expect(findings).toHaveLength(0);
  });
});
