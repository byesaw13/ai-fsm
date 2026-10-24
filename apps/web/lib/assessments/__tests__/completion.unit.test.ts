import { describe, it, expect } from "vitest";
import { completionToKeep } from "../completion";

describe("completionToKeep", () => {
  it("keeps a completed assessment completed, from a Date or a string", () => {
    expect(completionToKeep(new Date("2026-10-23T12:00:00Z"))).toBe("2026-10-23T12:00:00.000Z");
    expect(completionToKeep("2026-10-23 12:00:00+00")).toBe("2026-10-23T12:00:00.000Z");
  });

  it("stays null for an open assessment or an unreadable value", () => {
    expect(completionToKeep(null)).toBeNull();
    expect(completionToKeep(undefined)).toBeNull();
    expect(completionToKeep("not a date")).toBeNull();
  });
});
