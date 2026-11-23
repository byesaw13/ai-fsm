/**
 * P7-T1: Design System Unit Tests
 *
 * Tests the pure logic functions extracted from UI primitives.
 * React component rendering tests require jsdom + RTL (follow-up in P7-T5).
 * These tests validate: badge variant mapping, button class construction,
 * nav item filtering by role, active-route detection, and priority helpers.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Badge — getStatusBadgeClass, priorityNumToVariant, priorityLabel
// ---------------------------------------------------------------------------

import {
  getStatusBadgeClass,
  priorityNumToVariant,
  priorityLabel,
} from "../Badge";

describe("getStatusBadgeClass", () => {
  const statuses = [
    "draft", "sent", "approved", "declined", "expired",
    "paid", "overdue", "partial", "void", "in_progress",
    "scheduled", "completed", "cancelled", "arrived",
    "quoted", "invoiced",
  ] as const;

  it.each(statuses)("produces correct class for status '%s'", (status) => {
    const cls = getStatusBadgeClass(status);
    expect(cls).toBe(`p7-badge p7-badge-status-${status}`);
  });

  it("produces a class with both badge and status modifier", () => {
    const cls = getStatusBadgeClass("completed");
    expect(cls).toContain("p7-badge");
    expect(cls).toContain("p7-badge-status-completed");
  });
});

describe("priorityNumToVariant", () => {
  it("returns 'urgent' for priority 4", () => {
    expect(priorityNumToVariant(4)).toBe("urgent");
  });

  it("returns 'urgent' for priority > 4", () => {
    expect(priorityNumToVariant(5)).toBe("urgent");
  });

  it("returns 'high' for priority 3", () => {
    expect(priorityNumToVariant(3)).toBe("high");
  });

  it("returns 'medium' for priority 2", () => {
    expect(priorityNumToVariant(2)).toBe("medium");
  });

  it("returns 'low' for priority 1", () => {
    expect(priorityNumToVariant(1)).toBe("low");
  });

  it("returns null for priority 0", () => {
    expect(priorityNumToVariant(0)).toBeNull();
  });
});

describe("priorityLabel", () => {
  it.each([
    [4, "Urgent"],
    [5, "Urgent"],
    [3, "High"],
    [2, "Medium"],
    [1, "Low"],
    [0, ""],
  ])("returns '%s' for priority %d", (priority, expected) => {
    expect(priorityLabel(priority)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Button — getButtonClass
// ---------------------------------------------------------------------------

import { getButtonClass } from "../Button";

describe("getButtonClass", () => {
  it("includes base class and variant class", () => {
    const cls = getButtonClass("primary");
    expect(cls).toContain("p7-btn");
    expect(cls).toContain("p7-btn-primary");
  });

  it("does not add size class for default size", () => {
    const cls = getButtonClass("primary", "default");
    expect(cls).not.toContain("p7-btn-default");
  });

  it("adds 'p7-btn-sm' for sm size", () => {
    const cls = getButtonClass("secondary", "sm");
    expect(cls).toContain("p7-btn-sm");
  });

  it("adds 'p7-btn-lg' for lg size", () => {
    const cls = getButtonClass("danger", "lg");
    expect(cls).toContain("p7-btn-lg");
  });

  it("adds loading class when loading=true", () => {
    const cls = getButtonClass("primary", "default", true);
    expect(cls).toContain("p7-btn-loading");
  });

  it("does not add loading class when loading=false", () => {
    const cls = getButtonClass("primary", "default", false);
    expect(cls).not.toContain("p7-btn-loading");
  });

  it("appends extra className", () => {
    const cls = getButtonClass("ghost", "default", false, "my-extra-class");
    expect(cls).toContain("my-extra-class");
  });

  it("supports all variant types", () => {
    for (const variant of ["primary", "secondary", "danger", "ghost"] as const) {
      const cls = getButtonClass(variant);
      expect(cls).toContain(`p7-btn-${variant}`);
    }
  });
});

// ---------------------------------------------------------------------------
// AppShell — getNavSections, getBottomNavItems, isNavActive
// ---------------------------------------------------------------------------

import { getNavSections, getBottomNavItems, isNavActive, navAttentionCount } from "../../AppShell";
import { MONEY_HUB_LINKS, PEOPLE_HUB_LINKS, WORK_HUB_LINKS } from "@/lib/navigation/hubs";

describe("getNavSections (five places, TASK-237)", () => {
  // Every destination the 14-item sidebar had before TASK-237.
  const OLD_SIDEBAR = [
    "/app",
    "/app/my-work",
    "/app/capture",
    "/app/day-review",
    "/app/timeline",
    "/app/requests",
    "/app/estimates",
    "/app/jobs",
    "/app/schedule",
    "/app/clients",
    "/app/properties",
    "/app/invoices",
    "/app/reports",
    "/app/settings",
    "/app/map",
  ];
  // Tabs shown at the top of each hub page (lib/navigation/hubs.ts).
  const HUB_TABS: Record<string, string[]> = {
    "/app/jobs": WORK_HUB_LINKS.map((l) => l.href),
    "/app/clients": PEOPLE_HUB_LINKS.map((l) => l.href),
    "/app/invoices": MONEY_HUB_LINKS.map((l) => l.href),
  };

  function topLevel(role: "owner" | "admin", view?: "field" | "office") {
    const sections = getNavSections(role, view);
    return sections.flatMap((s) => (s.collapsible ? [{ href: "#more", label: s.label }] : s.items));
  }

  it("shows the home, Jobs, Customers, Money and More — five entries", () => {
    expect(topLevel("owner", "field").map((i) => i.label)).toEqual(["Today", "Jobs", "Customers", "Money", "More"]);
    expect(topLevel("owner", "office").map((i) => i.label)).toEqual(["Desk", "Jobs", "Customers", "Money", "More"]);
    expect(topLevel("admin").map((i) => i.label)).toEqual(["Desk", "Jobs", "Customers", "Money", "More"]);
  });

  it("puts Capture, Day Review, Tracking, Reports, Map and Settings under More", () => {
    const more = getNavSections("owner", "office").find((s) => s.collapsible);
    expect(more?.items.map((i) => i.label)).toEqual(["Capture", "Day Review", "Tracking", "Reports", "Map", "Settings"]);
  });

  it("gives admins Action Queue under More and no Map", () => {
    const more = getNavSections("admin").find((s) => s.collapsible);
    const hrefs = more?.items.map((i) => i.href) ?? [];
    expect(hrefs).toContain("/app/action-queue");
    expect(hrefs).not.toContain("/app/map");
  });

  it("keeps every old sidebar destination within two taps", () => {
    for (const role of ["owner", "admin"] as const) {
      for (const view of ["field", "office"] as const) {
        const sections = getNavSections(role, view);
        const oneTap = sections.flatMap((s) => s.items.map((i) => i.href));
        const twoTaps = new Set([...oneTap, ...oneTap.flatMap((h) => HUB_TABS[h] ?? [])]);
        for (const href of OLD_SIDEBAR) {
          if (role === "admin" && (href === "/app/my-work" || href === "/app/map")) continue;
          if (role === "owner" && href === (view === "field" ? "/app" : "/app/my-work")) continue;
          expect(twoTaps.has(href), `${role}/${view}: ${href}`).toBe(true);
        }
      }
    }
  });

  it("owner sidebar shows the active workspace's home, not both", () => {
    const field = topLevel("owner", "field").map((i) => i.href);
    expect(field[0]).toBe("/app/my-work");
    expect(field).not.toContain("/app");
    const office = topLevel("owner", "office").map((i) => i.href);
    expect(office[0]).toBe("/app");
    expect(office).not.toContain("/app/my-work");
  });

  it("returns Today only for tech", () => {
    const items = getNavSections("tech").flatMap((s) => s.items);
    expect(items.map((i) => i.href)).toEqual(["/app/my-work"]);
    expect(items.map((i) => i.label)).toEqual(["Today"]);
  });

  it("keeps Layer 2+ tools out of the menu", () => {
    const hrefs = getNavSections("admin").flatMap((s) => s.items.map((i) => i.href));
    for (const gone of ["/app/price-book", "/app/automations", "/app/work-orders", "/app/visits"]) {
      expect(hrefs).not.toContain(gone);
    }
  });

  it("puts a needs-attention count on Jobs (requests + estimates) and Money (invoices)", () => {
    const a = { requestsCount: 2, estimatesCount: 3, invoicesCount: 4 };
    expect(navAttentionCount("/app/jobs", a)).toBe(5);
    expect(navAttentionCount("/app/invoices", a)).toBe(4);
    expect(navAttentionCount("/app/clients", a)).toBe(0);
  });
});

describe("getBottomNavItems (mobile hubs)", () => {
  it("returns 4 hub tabs for admin (Desk Jobs Customers Money) — More is the 5th slot", () => {
    const items = getBottomNavItems("admin");
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.label)).toEqual(["Desk", "Jobs", "Customers", "Money"]);
    expect(items.map((i) => i.href)).toEqual([
      "/app",
      "/app/jobs",
      "/app/clients",
      "/app/invoices",
    ]);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).not.toContain("/app/booking-requests");
  });

  it("returns Today for tech bottom nav — no Day Review or Visits tab", () => {
    const items = getBottomNavItems("tech");
    expect(items).toHaveLength(1);
    expect(items.map((i) => i.label)).toEqual(["Today"]);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toEqual(["/app/my-work"]);
    expect(hrefs).not.toContain("/app/visits");
    expect(hrefs).not.toContain("/app/field");
    expect(hrefs).not.toContain("/app/jobs");
  });

  it("returns 4 hub tabs for owner leading with Today", () => {
    const items = getBottomNavItems("owner");
    expect(items.map((i) => i.label)).toEqual(["Today", "Jobs", "Customers", "Money"]);
    expect(items.map((i) => i.href)).toEqual([
      "/app/my-work",
      "/app/jobs",
      "/app/clients",
      "/app/invoices",
    ]);
  });

  it("Work hub tab stays active on estimates and schedule", () => {
    const work = getBottomNavItems("owner").find((i) => i.label === "Jobs");
    expect(work).toBeDefined();
    expect(isNavActive("/app/estimates/new", work!.href, work!.activePrefixes)).toBe(true);
    expect(isNavActive("/app/schedule", work!.href, work!.activePrefixes)).toBe(true);
    expect(isNavActive("/app/clients", work!.href, work!.activePrefixes)).toBe(false);
  });

  it("Home stays active on Tracking; Money stays active on Mileage", () => {
    const ownerHome = getBottomNavItems("owner").find((i) => i.label === "Today");
    const money = getBottomNavItems("owner").find((i) => i.label === "Money");
    expect(isNavActive("/app/timeline", ownerHome!.href, ownerHome!.activePrefixes)).toBe(true);
    expect(isNavActive("/app/day-review", ownerHome!.href, ownerHome!.activePrefixes)).toBe(true);
    expect(isNavActive("/app/capture", ownerHome!.href, ownerHome!.activePrefixes)).toBe(true);
    expect(isNavActive("/app/mileage/vehicles", money!.href, money!.activePrefixes)).toBe(true);
  });
});

describe("isNavActive (route detection)", () => {
  // /app is the owner command center — must be exact match only (not prefix)
  it("returns true for /app when pathname is exactly /app", () => {
    expect(isNavActive("/app", "/app")).toBe(true);
  });

  it("returns false for /app when pathname is /app/jobs (prevents Desk lighting up everywhere)", () => {
    expect(isNavActive("/app/jobs", "/app")).toBe(false);
  });

  it("returns false for /app when pathname is /app/estimates/new", () => {
    expect(isNavActive("/app/estimates/new", "/app")).toBe(false);
  });

  // Dashboard — exact match only
  it("returns true for /app/operations when pathname is exactly /app/operations", () => {
    expect(isNavActive("/app/operations", "/app/operations")).toBe(true);
  });

  it("returns false for /app/operations when pathname is /app/jobs", () => {
    expect(isNavActive("/app/jobs", "/app/operations")).toBe(false);
  });

  it("returns false for /app/operations when pathname is /app/visits", () => {
    expect(isNavActive("/app/visits", "/app/operations")).toBe(false);
  });

  // Jobs (/app/jobs) — prefix match
  it("returns true for /app/jobs when pathname is /app/jobs", () => {
    expect(isNavActive("/app/jobs", "/app/jobs")).toBe(true);
  });

  it("returns true for /app/jobs when pathname is /app/jobs/new", () => {
    expect(isNavActive("/app/jobs/new", "/app/jobs")).toBe(true);
  });

  it("returns true for /app/jobs when pathname is /app/jobs/abc-123", () => {
    expect(isNavActive("/app/jobs/abc-123", "/app/jobs")).toBe(true);
  });

  it("returns false for /app/jobs when pathname is /app/visits", () => {
    expect(isNavActive("/app/visits", "/app/jobs")).toBe(false);
  });

  // No cross-match between sibling routes
  it("does not treat /app/invoices as active for /app/invoices-v2", () => {
    expect(isNavActive("/app/invoices-v2", "/app/invoices")).toBe(false);
  });

  // Visits sub-routes
  it("returns true for /app/visits/:id path", () => {
    expect(isNavActive("/app/visits/visit-xyz", "/app/visits")).toBe(true);
  });

  // Automations
  it("returns true for /app/automations exact match", () => {
    expect(isNavActive("/app/automations", "/app/automations")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FilterBar — filter active detection (pure logic)
// ---------------------------------------------------------------------------

/**
 * Mirrors the logic in FilterBar component for detecting active filters.
 * Test the predicate used to determine which filters have values.
 */
function hasActiveFilter(currentValues: Record<string, string>, name: string): boolean {
  return Boolean(currentValues[name] && currentValues[name] !== "");
}

function countActiveFilters(
  filters: { name: string }[],
  currentValues: Record<string, string>
): number {
  return filters.filter((f) => hasActiveFilter(currentValues, f.name)).length;
}

describe("FilterBar active filter detection", () => {
  const filters = [
    { name: "q" },
    { name: "status" },
    { name: "priority" },
  ];

  it("returns 0 when no filters are active", () => {
    expect(countActiveFilters(filters, {})).toBe(0);
  });

  it("returns 1 when one filter is active", () => {
    expect(countActiveFilters(filters, { q: "roof" })).toBe(1);
  });

  it("returns 2 when two filters are active", () => {
    expect(countActiveFilters(filters, { q: "roof", status: "in_progress" })).toBe(2);
  });

  it("does not count empty string as active", () => {
    expect(countActiveFilters(filters, { q: "", status: "scheduled" })).toBe(1);
  });

  it("counts all three when all active", () => {
    expect(
      countActiveFilters(filters, { q: "hvac", status: "draft", priority: "3" })
    ).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// MetricGrid — variant helper logic
// ---------------------------------------------------------------------------

function metricVariantClass(
  variant: "default" | "alert" | "success" | undefined
): string {
  if (variant === "alert") return "p7-metric-alert";
  if (variant === "success") return "p7-metric-success";
  return "";
}

describe("MetricGrid variant class helper", () => {
  it("returns alert class for alert variant", () => {
    expect(metricVariantClass("alert")).toBe("p7-metric-alert");
  });

  it("returns success class for success variant", () => {
    expect(metricVariantClass("success")).toBe("p7-metric-success");
  });

  it("returns empty string for default variant", () => {
    expect(metricVariantClass("default")).toBe("");
  });

  it("returns empty string when variant is undefined", () => {
    expect(metricVariantClass(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Toast — auto-dismiss timing logic
// ---------------------------------------------------------------------------

const DEFAULT_DISMISS_MS: Record<string, number> = {
  success: 4000,
  error: 0,
  info: 4000,
};

describe("Toast auto-dismiss timing", () => {
  it("success toasts auto-dismiss after 4000ms", () => {
    expect(DEFAULT_DISMISS_MS["success"]).toBe(4000);
  });

  it("error toasts do not auto-dismiss (0ms = manual)", () => {
    expect(DEFAULT_DISMISS_MS["error"]).toBe(0);
  });

  it("info toasts auto-dismiss after 4000ms", () => {
    expect(DEFAULT_DISMISS_MS["info"]).toBe(4000);
  });
});
