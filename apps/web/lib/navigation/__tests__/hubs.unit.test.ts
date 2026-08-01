import { describe, expect, it } from "vitest";
import {
  WORK_HUB_LINKS,
  PEOPLE_HUB_LINKS,
  MONEY_HUB_LINKS,
  activeHubHref,
  isHubLinkActive,
} from "../hubs";

describe("hubs navigation", () => {
  it("exposes Work / People / Money sibling sets", () => {
    expect(WORK_HUB_LINKS.map((l) => l.href)).toContain("/app/jobs");
    expect(PEOPLE_HUB_LINKS.map((l) => l.href)).toEqual([
      "/app/clients",
      "/app/properties",
    ]);
    expect(MONEY_HUB_LINKS.map((l) => l.href)).toContain("/app/invoices");
  });

  it("matches prefix paths for hub chips", () => {
    expect(isHubLinkActive("/app/jobs/abc", "/app/jobs")).toBe(true);
    expect(isHubLinkActive("/app/estimates/new", "/app/estimates")).toBe(true);
    expect(isHubLinkActive("/app/clients", "/app/jobs")).toBe(false);
  });

  it("picks the most specific active href", () => {
    expect(activeHubHref("/app/jobs/xyz", WORK_HUB_LINKS)).toBe("/app/jobs");
    expect(activeHubHref("/app/properties/1", PEOPLE_HUB_LINKS)).toBe(
      "/app/properties",
    );
    expect(activeHubHref("/app/my-work", WORK_HUB_LINKS)).toBeNull();
  });

  it("Money hub matches invoices, expenses, materials, reports", () => {
    expect(activeHubHref("/app/invoices/abc", MONEY_HUB_LINKS)).toBe(
      "/app/invoices",
    );
    expect(activeHubHref("/app/expenses/new", MONEY_HUB_LINKS)).toBe(
      "/app/expenses",
    );
    expect(activeHubHref("/app/materials", MONEY_HUB_LINKS)).toBe(
      "/app/materials",
    );
    expect(activeHubHref("/app/reports", MONEY_HUB_LINKS)).toBe("/app/reports");
    expect(MONEY_HUB_LINKS.map((l) => l.href)).toContain("/app/materials");
  });
});
