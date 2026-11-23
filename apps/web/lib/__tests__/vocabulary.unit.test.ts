import { describe, expect, it } from "vitest";
import { UI } from "../vocabulary";
import { getBottomNavItems, getNavSections } from "@/components/AppShell";
import { MONEY_HUB_LINKS, PEOPLE_HUB_LINKS, WORK_HUB_LINKS } from "@/lib/navigation/hubs";
import { filterCommands } from "@/lib/navigation/command-index";

describe("human nouns", () => {
  it("locks the words the shop and its customers see (owner 2026-11-22)", () => {
    expect(UI.customer).toBe("Customer");
    expect(UI.customers).toBe("Customers");
    expect(UI.property).toBe("Property");
    expect(UI.properties).toBe("Properties");
    expect(UI.job).toBe("Job");
    expect(UI.jobs).toBe("Jobs");
    expect(UI.today).toBe("Today");
    expect(UI.estimate).toBe("Estimate");
    expect(UI.estimates).toBe("Estimates");
    expect(UI.invoice).toBe("Invoice");
    expect(UI.invoices).toBe("Invoices");
    expect(UI.desk).toBe("Desk");
  });
});

describe("nav speaks those nouns", () => {
  it("labels the field home Today and the office home Desk", () => {
    const ownerField = getNavSections("owner", "field")[0].items[0];
    expect(ownerField).toMatchObject({ href: "/app/my-work", label: UI.today });

    const ownerOffice = getNavSections("owner", "office")[0].items[0];
    expect(ownerOffice).toMatchObject({ href: "/app", label: UI.desk });

    const admin = getNavSections("admin")[0].items[0];
    expect(admin).toMatchObject({ href: "/app", label: UI.desk });

    const tech = getNavSections("tech")[0].items[0];
    expect(tech).toMatchObject({ href: "/app/my-work", label: UI.today });
  });

  it("calls jobs Jobs, estimates Estimates, invoices Invoices, properties Properties", () => {
    const work = getNavSections("admin").find((s) => s.label === "Work");
    expect(work?.items.find((i) => i.href === "/app/jobs")?.label).toBe(UI.jobs);
    expect(work?.items.find((i) => i.href === "/app/estimates")?.label).toBe(UI.estimates);

    const money = getNavSections("admin").find((s) => s.label === "Money");
    expect(money?.items.find((i) => i.href === "/app/invoices")?.label).toBe(UI.invoices);

    const people = getNavSections("admin").find((s) => s.label === UI.customers);
    expect(people?.items.find((i) => i.href === "/app/properties")?.label).toBe(UI.properties);
    expect(people?.items.find((i) => i.href === "/app/clients")?.label).toBe(UI.customers);
  });

  it("gives the owner phone tabs Today / Jobs / Customers / Money", () => {
    expect(getBottomNavItems("owner").map((i) => i.label)).toEqual([
      UI.today,
      UI.jobs,
      UI.customers,
      "Money",
    ]);
    expect(getBottomNavItems("owner").map((i) => i.href)).toEqual([
      "/app/my-work",
      "/app/jobs",
      "/app/clients",
      "/app/invoices",
    ]);
  });

  it("gives the admin phone tabs Desk / Jobs / Customers / Money", () => {
    expect(getBottomNavItems("admin").map((i) => i.label)).toEqual([
      UI.desk,
      UI.jobs,
      UI.customers,
      "Money",
    ]);
  });

  it("gives the tech Today only — no Day Review or Visits tab", () => {
    expect(getBottomNavItems("tech").map((i) => i.label)).toEqual([UI.today]);
    expect(getBottomNavItems("tech").map((i) => i.href)).not.toContain("/app/visits");
    expect(getNavSections("tech")[0].items.map((i) => i.href)).not.toContain("/app/visits");
  });
});

describe("hubs and command palette", () => {
  it("chips say Jobs, Estimates, Invoices, Properties — never Projects or My Day", () => {
    expect(WORK_HUB_LINKS.find((l) => l.href === "/app/jobs")?.label).toBe(UI.jobs);
    expect(WORK_HUB_LINKS.find((l) => l.href === "/app/estimates")?.label).toBe(UI.estimates);
    expect(MONEY_HUB_LINKS.find((l) => l.href === "/app/invoices")?.label).toBe(UI.invoices);
    expect(PEOPLE_HUB_LINKS.find((l) => l.href === "/app/properties")?.label).toBe(UI.properties);

    const labels = [...WORK_HUB_LINKS, ...PEOPLE_HUB_LINKS, ...MONEY_HUB_LINKS].map((l) => l.label);
    expect(labels).toContain(UI.customers);
    expect(labels).not.toContain("Clients");
    expect(labels).not.toContain("Work Orders");
    expect(labels).not.toContain("Visits");
    expect(labels).not.toContain("Projects");
    expect(labels).not.toContain("My Day");
    expect(labels).not.toContain("Overview");
  });

  it("command index finds Today, Desk, Jobs, Estimates, Invoices, Customers", () => {
    const labels = filterCommands("", "owner").map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        UI.today,
        UI.desk,
        UI.jobs,
        UI.estimates,
        UI.invoices,
        UI.customers,
        "Tracking",
      ]),
    );
    expect(labels).not.toContain("Clients");
    expect(labels).not.toContain("My Day");
    expect(labels).not.toContain("Projects");
    expect(labels).not.toContain("Overview");
    expect(labels).not.toContain("Work Orders");
  });
});
