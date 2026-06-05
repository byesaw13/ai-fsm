import { describe, it, expect } from "vitest";
import { deriveJobTitle, deriveJobDescription } from "../job-from-estimate";

const base = { notes: null, property_address: null, client_name: null, total_cents: 162500 };

describe("deriveJobTitle", () => {
  it("uses the first non-empty line of notes as the title", () => {
    expect(deriveJobTitle({ ...base, notes: "Replace rotted deck boards\nand reseal" }))
      .toBe("Replace rotted deck boards");
  });

  it("skips leading blank lines", () => {
    expect(deriveJobTitle({ ...base, notes: "\n\n  Paint exterior trim  \n" }))
      .toBe("Paint exterior trim");
  });

  it("truncates very long first lines to 80 chars with an ellipsis", () => {
    const long = "x".repeat(200);
    const title = deriveJobTitle({ ...base, notes: long });
    expect(title.length).toBe(80);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to property address when notes are empty", () => {
    expect(deriveJobTitle({ ...base, notes: "   ", property_address: "12 Oak St" }))
      .toBe("Work at 12 Oak St");
  });

  it("falls back to client name when no notes or property", () => {
    expect(deriveJobTitle({ ...base, client_name: "Jane Doe" }))
      .toBe("Approved work for Jane Doe");
  });

  it("falls back to a generic title when nothing is available", () => {
    expect(deriveJobTitle(base)).toBe("Approved estimate work");
  });
});

describe("deriveJobDescription", () => {
  it("includes the estimate notes and references the source estimate total", () => {
    const d = deriveJobDescription({ ...base, notes: "Fix gutter", total_cents: 50000 });
    expect(d).toContain("Fix gutter");
    expect(d).toContain("Created from approved estimate ($500).");
  });

  it("still references the source estimate when notes are empty", () => {
    const d = deriveJobDescription({ ...base, total_cents: 162500 });
    expect(d).toContain("Created from approved estimate ($1,625).");
  });
});
