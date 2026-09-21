import { describe, expect, it } from "vitest";
import { UI } from "../vocabulary";
import { getBottomNavItems, getNavSections } from "@/components/AppShell";
import { MONEY_HUB_LINKS, PEOPLE_HUB_LINKS, WORK_HUB_LINKS } from "@/lib/navigation/hubs";
import { filterCommands } from "@/lib/navigation/command-index";

describe("human nouns", () => {
  it("locks the six words the shop uses", () => {
    expect(UI.person).toBe("Person");
    expect(UI.people).toBe("People");
    expect(UI.house).toBe("House");
    expect(UI.houses).toBe("Houses");
    expect(UI.job).toBe("Job");
    expect(UI.jobs).toBe("Jobs");
    expect(UI.today).toBe("Today");
    expect(UI.quote).toBe("Quote");
    expect(UI.quotes).toBe("Quotes");
    expect(UI.bill).toBe("Bill");
    expect(UI.bills).toBe("Bills");
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

  it("calls jobs Jobs, estimates Quotes, invoices Bills, properties Houses", () => {
    const work = getNavSections("admin").find((s) => s.label === "Work");
    expect(work?.items.find((i) => i.href === "/app/jobs")?.label).toBe(UI.jobs);
    expect(work?.items.find((i) => i.href === "/app/estimates")?.label).toBe(UI.quotes);

    const money = getNavSections("admin").find((s) => s.label === "Money");
    expect(money?.items.find((i) => i.href === "/app/invoices")?.label).toBe(UI.bills);

    const people = getNavSections("admin").find((s) => s.label === "People");
    expect(people?.items.find((i) => i.href === "/app/properties")?.label).toBe(UI.houses);
  });

  it("gives the owner phone tabs Today / Jobs / People / Money", () => {
    expect(getBottomNavItems("owner").map((i) => i.label)).toEqual([
      UI.today,
      UI.jobs,
      UI.people,
      "Money",
    ]);
    expect(getBottomNavItems("owner").map((i) => i.href)).toEqual([
      "/app/my-work",
      "/app/jobs",
      "/app/clients",
      "/app/invoices",
    ]);
  });

  it("gives the admin phone tabs Desk / Jobs / People / Money", () => {
    expect(getBottomNavItems("admin").map((i) => i.label)).toEqual([
      UI.desk,
      UI.jobs,
      UI.people,
      "Money",
    ]);
  });

  it("gives the tech Today and Visits", () => {
    expect(getBottomNavItems("tech").map((i) => i.label)).toEqual([UI.today, "Visits"]);
  });
});

describe("hubs and command palette", () => {
  it("chips say Jobs, Quotes, Bills, Houses — never Projects or My Day", () => {
    expect(WORK_HUB_LINKS.find((l) => l.href === "/app/jobs")?.label).toBe(UI.jobs);
    expect(WORK_HUB_LINKS.find((l) => l.href === "/app/estimates")?.label).toBe(UI.quotes);
    expect(MONEY_HUB_LINKS.find((l) => l.href === "/app/invoices")?.label).toBe(UI.bills);
    expect(PEOPLE_HUB_LINKS.find((l) => l.href === "/app/properties")?.label).toBe(UI.houses);

    const labels = [...WORK_HUB_LINKS, ...PEOPLE_HUB_LINKS, ...MONEY_HUB_LINKS].map((l) => l.label);
    expect(labels).not.toContain("Projects");
    expect(labels).not.toContain("My Day");
    expect(labels).not.toContain("Overview");
  });

  it("command index finds Today, Desk, Jobs, Quotes, Bills", () => {
    const labels = filterCommands("", "owner").map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining([UI.today, UI.desk, UI.jobs, UI.quotes, UI.bills, "Tracking"]),
    );
    expect(labels).not.toContain("My Day");
    expect(labels).not.toContain("Projects");
    expect(labels).not.toContain("Overview");
  });
});
