import { describe, expect, it } from "vitest";
import {
  buildJobCreateHref,
  formatClientContact,
  formatPropertyAddress,
  matchesSearch,
  normalizeSearch,
} from "../p7";

describe("crm/p7 helpers", () => {
  it("normalizes search text", () => {
    expect(normalizeSearch("  Alice SMITH  ")).toBe("alice smith");
    expect(normalizeSearch(undefined)).toBe("");
  });

  it("matches search across multiple fields", () => {
    expect(matchesSearch(["Alice Smith", "alice@example.com"], "EXAMPLE")).toBe(true);
    expect(matchesSearch(["Alice Smith", null], "bob")).toBe(false);
    expect(matchesSearch(["Alice Smith"], "")).toBe(true);
  });

  it("formats client contact with fallback", () => {
    expect(formatClientContact({ name: "Alice", email: "a@test.com", phone: "555" })).toBe(
      "a@test.com • 555"
    );
    expect(formatClientContact({ name: "Alice", email: null, phone: null })).toBe(
      "No contact details"
    );
  });

  it("formats property address with name and locality", () => {
    expect(
      formatPropertyAddress({
        name: "Main House",
        address: "123 Oak St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      })
    ).toBe("Main House — 123 Oak St, Austin TX 78701");
  });

  it("formats property address without optional fields", () => {
    expect(formatPropertyAddress({ address: "456 Pine Rd" })).toBe("456 Pine Rd");
  });

  it("builds job create href with client and optional property", () => {
    expect(buildJobCreateHref("c1")).toBe("/app/jobs/new?client_id=c1");
    expect(buildJobCreateHref("c1", "p1")).toBe("/app/jobs/new?client_id=c1&property_id=p1");
  });
});
