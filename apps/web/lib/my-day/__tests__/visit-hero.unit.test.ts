import { describe, it, expect } from "vitest";
import {
  pickHeroVisit,
  buildMapsUrl,
  buildTelUrl,
  heroPrimaryAction,
  excludeHeroVisit,
} from "../visit-hero";

const base = {
  job_title: "Fix faucet",
  property_address: "123 Oak St",
  client_name: "Smith",
  client_phone: "5551234567",
};

describe("pickHeroVisit", () => {
  const now = new Date("2026-06-30T10:00:00Z").getTime();

  it("prefers active in_progress over scheduled", () => {
    const visits = [
      { id: "a", status: "scheduled", scheduled_start: "2026-06-30T11:00:00Z", ...base },
      { id: "b", status: "in_progress", scheduled_start: "2026-06-30T09:00:00Z", ...base },
    ];
    expect(pickHeroVisit(visits, now)?.id).toBe("b");
  });

  it("prefers overdue scheduled over future scheduled", () => {
    const visits = [
      { id: "a", status: "scheduled", scheduled_start: "2026-06-30T11:00:00Z", ...base },
      { id: "b", status: "scheduled", scheduled_start: "2026-06-30T08:00:00Z", ...base },
    ];
    expect(pickHeroVisit(visits, now)?.id).toBe("b");
  });

  it("returns null when no pending visits", () => {
    expect(pickHeroVisit([], now)).toBeNull();
  });
});

describe("buildMapsUrl", () => {
  it("returns encoded maps url", () => {
    expect(buildMapsUrl("123 Oak St")).toBe(
      "https://maps.google.com/maps?q=123%20Oak%20St"
    );
  });
  it("returns null for empty", () => {
    expect(buildMapsUrl(null)).toBeNull();
    expect(buildMapsUrl("  ")).toBeNull();
  });
});

describe("buildTelUrl", () => {
  it("returns tel link", () => {
    expect(buildTelUrl("555-123-4567")).toBe("tel:5551234567");
  });
  it("returns null for empty", () => {
    expect(buildTelUrl(null)).toBeNull();
  });
});

describe("heroPrimaryAction", () => {
  it("start for scheduled", () => {
    expect(heroPrimaryAction("scheduled")).toBe("start");
  });
  it("complete for arrived and in_progress", () => {
    expect(heroPrimaryAction("arrived")).toBe("complete");
    expect(heroPrimaryAction("in_progress")).toBe("complete");
  });
  it("null for completed", () => {
    expect(heroPrimaryAction("completed")).toBeNull();
  });
});

describe("excludeHeroVisit", () => {
  it("removes hero id from list", () => {
    const visits = [{ id: "a" }, { id: "b" }];
    expect(excludeHeroVisit(visits, "a")).toEqual([{ id: "b" }]);
  });
});