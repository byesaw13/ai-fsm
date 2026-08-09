import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../db/migrations/171_job_store_run.sql",
);

describe("job store run migration", () => {
  it("persists store locations, scoped supplier preferences, and a reversal", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain(
      "ALTER TABLE job_material_lines\n  ADD COLUMN IF NOT EXISTS supplier TEXT,\n  ADD COLUMN IF NOT EXISTS aisle TEXT,\n  ADD COLUMN IF NOT EXISTS bay TEXT;",
    );
    expect(migration).toContain(
      "ALTER TABLE materials_price_book\n  ADD COLUMN IF NOT EXISTS aisle TEXT,\n  ADD COLUMN IF NOT EXISTS bay TEXT;",
    );
    expect(migration).toContain("UNIQUE (account_id, supplier_normalized)");
    expect(migration).toContain("CREATE POLICY account_supplier_preferences_insert");
    expect(migration).toContain("CREATE POLICY account_supplier_preferences_update");
    expect(migration).toContain("CREATE POLICY account_supplier_preferences_delete");
    expect(migration).toContain("app_role() IN ('owner', 'admin')");
    expect(migration).toContain("-- DROP TABLE account_supplier_preferences;");
  });
});
