import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * TASK-218: Craftsman reference hours are display only. They must never feed
 * price, line hours, the hourly baseline, confidence or AI prompts. Only the
 * price book page and its read API may touch them.
 */
const WEB_ROOT = join(__dirname, "..", "..", "..");
const ALLOWED = new Set([
  "app/api/v1/price-book/route.ts",
  "app/app/price-book/page.tsx",
  "app/app/price-book/PriceBookClient.tsx",
  "app/app/price-book/ReferenceBlock.tsx",
]);
const PATTERN = /reference_hours|parseReferenceHours|referenceSwapHours|ReferenceHoursEntry/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("reference hours stay display-only", () => {
  it("only the price book page and read API use them", () => {
    const users = walk(WEB_ROOT)
      .filter((f) => PATTERN.test(readFileSync(f, "utf8")))
      .map((f) => relative(WEB_ROOT, f));
    expect(users.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });
});
