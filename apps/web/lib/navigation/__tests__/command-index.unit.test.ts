import { describe, expect, it } from "vitest";
import { COMMAND_INDEX, filterCommands } from "../command-index";

describe("command index", () => {
  it("exposes My Day, Overview, and Tracking for the owner", () => {
    const labels = filterCommands("", "owner").map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["My Day", "Overview", "Tracking", "Projects", "Invoices"]));
  });

  it("hides office destinations from techs", () => {
    const hrefs = filterCommands("", "tech").map((c) => c.href);
    expect(hrefs).toContain("/app/my-work");
    expect(hrefs).toContain("/app/visits");
    expect(hrefs).not.toContain("/app/invoices");
    expect(hrefs).not.toContain("/app/timeline");
    expect(hrefs).not.toContain("/app/estimates");
    expect(hrefs).not.toContain("/app/expenses/new");
    expect(hrefs).not.toContain("/app/intake/new");
  });

  it("filters by label and keywords", () => {
    const hits = filterCommands("invoice", "owner");
    expect(hits.some((c) => c.href.startsWith("/app/invoices"))).toBe(true);
    expect(filterCommands("xyzzy", "owner")).toEqual([]);
  });

  it("does not list duplicate label+href pairs", () => {
    const keys = COMMAND_INDEX.map((c) => `${c.label}|${c.href}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
