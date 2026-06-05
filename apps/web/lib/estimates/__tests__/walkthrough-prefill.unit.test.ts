import { describe, it, expect } from "vitest";
import { buildWalkthroughScopeNotes } from "../walkthrough-prefill";

const empty = {
  visitDate: null,
  techNotes: null,
  parts: [],
  assessmentPhotoCount: 0,
  beforePhotoCount: 0,
};

describe("buildWalkthroughScopeNotes", () => {
  it("returns empty string when there is nothing to pre-fill", () => {
    expect(buildWalkthroughScopeNotes(empty)).toBe("");
  });

  it("includes the technician notes", () => {
    const out = buildWalkthroughScopeNotes({ ...empty, techNotes: "Subfloor is soft near the window." });
    expect(out).toContain("Subfloor is soft near the window.");
    expect(out).toContain("Walkthrough findings");
  });

  it("dates the findings when a visit date is supplied", () => {
    const out = buildWalkthroughScopeNotes({ ...empty, techNotes: "x", visitDate: "2026-04-10T14:00:00Z" });
    expect(out).toMatch(/Apr 10, 2026/);
  });

  it("lists parts with quantities", () => {
    const out = buildWalkthroughScopeNotes({
      ...empty,
      parts: [
        { name: "Wax ring", quantity: 1 },
        { name: "Supply line", quantity: 2 },
      ],
    });
    expect(out).toContain("Parts identified on site:");
    expect(out).toContain("- Wax ring");
    expect(out).toContain("- Supply line x2");
  });

  it("summarizes photo evidence", () => {
    const out = buildWalkthroughScopeNotes({ ...empty, assessmentPhotoCount: 3, beforePhotoCount: 1 });
    expect(out).toContain("3 assessment photos");
    expect(out).toContain("1 before photo");
    expect(out).not.toContain("1 before photos"); // singular
  });

  it("combines all sections in order: findings, notes, parts, evidence", () => {
    const out = buildWalkthroughScopeNotes({
      visitDate: "2026-04-10T14:00:00Z",
      techNotes: "Leak under sink.",
      parts: [{ name: "P-trap", quantity: 1 }],
      assessmentPhotoCount: 2,
      beforePhotoCount: 0,
    });
    const findingsIdx = out.indexOf("Walkthrough findings");
    const notesIdx = out.indexOf("Leak under sink.");
    const partsIdx = out.indexOf("Parts identified");
    const evidenceIdx = out.indexOf("Evidence on file");
    expect(findingsIdx).toBeGreaterThanOrEqual(0);
    expect(notesIdx).toBeGreaterThan(findingsIdx);
    expect(partsIdx).toBeGreaterThan(notesIdx);
    expect(evidenceIdx).toBeGreaterThan(partsIdx);
  });
});
