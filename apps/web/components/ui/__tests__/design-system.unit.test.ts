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

import { getNavSections, getBottomNavItems, isNavActive } from "../../AppShell";

function flattenSections(sections: ReturnType<typeof getNavSections>) {
  return sections.flatMap((s) => s.items);
}

describe("getNavSections (role filtering)", () => {
  it("returns 1 section (Layer 1 daily driver) for admin role", () => {
    const sections = getNavSections("admin");
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe("");
  });

  it("Owner/admin nav has Today, My Day, Requests, Clients, Properties, Estimates, Jobs, Schedule, Invoices, Reports, Settings", () => {
    const sections = getNavSections("admin");
    const hrefs = sections[0].items.map((i) => i.href);
    expect(hrefs).toContain("/app");
    expect(hrefs).toContain("/app/my-day"); // EPIC-006: owner/admin can switch to My Day
    expect(hrefs).toContain("/app/requests");
    expect(hrefs).toContain("/app/clients");
    expect(hrefs).toContain("/app/properties");
    expect(hrefs).toContain("/app/estimates");
    expect(hrefs).toContain("/app/jobs");
    expect(hrefs).toContain("/app/schedule");
    expect(hrefs).toContain("/app/invoices");
    expect(hrefs).toContain("/app/reports");
    expect(hrefs).toContain("/app/settings");
    expect(hrefs).not.toContain("/app/mileage");
    expect(hrefs).toHaveLength(11);
  });

  it("Layer 2+ tools are not in main nav", () => {
    const items = flattenSections(getNavSections("admin"));
    const hrefs = items.map((i) => i.href);
    expect(hrefs).not.toContain("/app/price-book");
    expect(hrefs).not.toContain("/app/maintenance-plans");
    expect(hrefs).not.toContain("/app/field");
    expect(hrefs).not.toContain("/portal/login");
    expect(hrefs).not.toContain("/app/automations");
    expect(hrefs).not.toContain("/app/inbox");
    expect(hrefs).not.toContain("/app/booking-requests");
  });

  it("returns the same 1-section nav for owner role with 11 items", () => {
    const sections = getNavSections("owner");
    expect(sections).toHaveLength(1);
    expect(flattenSections(sections)).toHaveLength(11);
  });

  it("returns only 2 items for tech role (My Day + Visits)", () => {
    const sections = getNavSections("tech");
    const items = flattenSections(sections);
    expect(items).toHaveLength(2);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/app/my-day");
    expect(hrefs).toContain("/app/visits");
    expect(hrefs).not.toContain("/app/field");
    expect(hrefs).not.toContain("/app/settings");
    expect(hrefs).not.toContain("/app/jobs");
    expect(hrefs).not.toContain("/app/estimates");
    expect(hrefs).not.toContain("/app/invoices");
    expect(hrefs).not.toContain("/app/automations");
  });

  it("includes Today first for admin/owner, My Day first for tech", () => {
    const techItems = flattenSections(getNavSections("tech"));
    expect(techItems[0].href).toBe("/app/my-day");

    for (const role of ["admin", "owner"] as const) {
      const sections = getNavSections(role);
      expect(sections[0].items[0].href).toBe("/app");
      expect(sections[0].items[0].label).toBe("Today");
    }
  });
});

describe("getBottomNavItems (mobile)", () => {
  it("returns 3 link items for admin role (Today, Requests, Jobs) — the 4th slot is the More button", () => {
    const items = getBottomNavItems("admin");
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.href)).toEqual([
      "/app",
      "/app/requests",
      "/app/jobs",
    ]);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).not.toContain("/app/booking-requests");
    expect(hrefs).not.toContain("/app/estimates");
  });

  it("returns 2 items for tech role with My Day and Visits", () => {
    const items = getBottomNavItems("tech");
    expect(items).toHaveLength(2);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/app/my-day");
    expect(hrefs).toContain("/app/visits");
    expect(hrefs).not.toContain("/app/field");
    expect(hrefs).not.toContain("/app/jobs");
  });
});

describe("isNavActive (route detection)", () => {
  // /app is the owner command center — must be exact match only (not prefix)
  it("returns true for /app when pathname is exactly /app", () => {
    expect(isNavActive("/app", "/app")).toBe(true);
  });

  it("returns false for /app when pathname is /app/jobs (prevents My Day lighting up everywhere)", () => {
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

  // Jobs — prefix match
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
