import { describe, it, expect } from "vitest";
import { parseNameStatus, parseAddedLines } from "../diff.js";

describe("parseNameStatus", () => {
  it("parses add/modify/delete and renames", () => {
    const out = [
      "M\tapps/web/app/api/foo/route.ts",
      "A\tdb/migrations/120_x.sql",
      "D\tapps/web/lib/old.ts",
      "R100\tapps/web/a.ts\tapps/web/b.ts",
    ].join("\n");
    const entries = parseNameStatus(out);
    expect(entries).toEqual([
      { status: "M", path: "apps/web/app/api/foo/route.ts" },
      { status: "A", path: "db/migrations/120_x.sql" },
      { status: "D", path: "apps/web/lib/old.ts" },
      { status: "R", path: "apps/web/b.ts" },
    ]);
  });

  it("ignores blank lines", () => {
    expect(parseNameStatus("\n\n")).toEqual([]);
  });
});

describe("parseAddedLines", () => {
  it("collects + lines with correct new-file line numbers", () => {
    const diff = [
      "diff --git a/f.ts b/f.ts",
      "--- a/f.ts",
      "+++ b/f.ts",
      "@@ -1,2 +1,3 @@",
      " context",
      "+added one",
      "+added two",
      " more context",
    ].join("\n");
    const added = parseAddedLines(diff);
    expect(added).toEqual([
      { line: 2, text: "added one" },
      { line: 3, text: "added two" },
    ]);
  });

  it("tracks line numbers across removed lines", () => {
    const diff = ["@@ -1,3 +1,2 @@", " a", "-removed", "+replacement"].join("\n");
    const added = parseAddedLines(diff);
    expect(added).toEqual([{ line: 2, text: "replacement" }]);
  });
});
