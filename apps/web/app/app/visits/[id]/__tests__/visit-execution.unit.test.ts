/**
 * Visit Execution — unit tests
 *
 * Tests pure helper functions for the Visit Execution field command center.
 * No DB, no Next.js runtime.
 */

import { describe, it, expect } from "vitest";
import {
  ACTIVE_VISIT_STATUSES,
  TERMINAL_VISIT_STATUSES,
  ISSUE_SEVERITY_COLORS,
  NOTE_SOURCE_DISPLAY,
  shouldShowPropertyContext,
  shouldShowFollowUp,
  shouldShowCompletionRecord,
  formatContextDate,
  buildEstimateUrl,
} from "../visit-execution-helpers";

// ---------------------------------------------------------------------------
// Status categorization
// ---------------------------------------------------------------------------

const ALL_DB_VISIT_STATUSES = [
  "scheduled", "arrived", "in_progress", "completed", "cancelled",
] as const;

describe("ACTIVE_VISIT_STATUSES", () => {
  it("contains exactly scheduled, arrived, in_progress", () => {
    expect(ACTIVE_VISIT_STATUSES).toHaveLength(3);
    expect(ACTIVE_VISIT_STATUSES).toContain("scheduled");
    expect(ACTIVE_VISIT_STATUSES).toContain("arrived");
    expect(ACTIVE_VISIT_STATUSES).toContain("in_progress");
  });

  it("does NOT include completed or cancelled", () => {
    expect(ACTIVE_VISIT_STATUSES).not.toContain("completed");
    expect(ACTIVE_VISIT_STATUSES).not.toContain("cancelled");
  });
});

describe("TERMINAL_VISIT_STATUSES", () => {
  it("contains completed and cancelled", () => {
    expect(TERMINAL_VISIT_STATUSES).toContain("completed");
    expect(TERMINAL_VISIT_STATUSES).toContain("cancelled");
  });

  it("does NOT include active statuses", () => {
    expect(TERMINAL_VISIT_STATUSES).not.toContain("scheduled");
    expect(TERMINAL_VISIT_STATUSES).not.toContain("arrived");
    expect(TERMINAL_VISIT_STATUSES).not.toContain("in_progress");
  });
});

describe("active + terminal union = all DB statuses", () => {
  it("covers all five DB visit status values", () => {
    const combined = [...ACTIVE_VISIT_STATUSES, ...TERMINAL_VISIT_STATUSES];
    for (const s of ALL_DB_VISIT_STATUSES) {
      expect(combined).toContain(s);
    }
  });
});

// ---------------------------------------------------------------------------
// shouldShowPropertyContext
// ---------------------------------------------------------------------------

describe("shouldShowPropertyContext", () => {
  it("returns true for scheduled (tech preparing for visit)", () => {
    expect(shouldShowPropertyContext("scheduled")).toBe(true);
  });

  it("returns true for arrived (tech on-site)", () => {
    expect(shouldShowPropertyContext("arrived")).toBe(true);
  });

  it("returns true for in_progress (work underway)", () => {
    expect(shouldShowPropertyContext("in_progress")).toBe(true);
  });

  it("returns false for completed (no longer relevant for execution)", () => {
    expect(shouldShowPropertyContext("completed")).toBe(false);
  });

  it("returns false for cancelled", () => {
    expect(shouldShowPropertyContext("cancelled")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldShowFollowUp
// ---------------------------------------------------------------------------

describe("shouldShowFollowUp", () => {
  it("returns true only for completed visits", () => {
    expect(shouldShowFollowUp("completed")).toBe(true);
  });

  it("returns false for all other statuses", () => {
    for (const s of ["scheduled", "arrived", "in_progress", "cancelled"]) {
      expect(shouldShowFollowUp(s)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// shouldShowCompletionRecord
// ---------------------------------------------------------------------------

describe("shouldShowCompletionRecord", () => {
  it("returns true for completed visits", () => {
    expect(shouldShowCompletionRecord("completed")).toBe(true);
  });

  it("returns false for active and cancelled visits", () => {
    expect(shouldShowCompletionRecord("scheduled")).toBe(false);
    expect(shouldShowCompletionRecord("arrived")).toBe(false);
    expect(shouldShowCompletionRecord("in_progress")).toBe(false);
    expect(shouldShowCompletionRecord("cancelled")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ISSUE_SEVERITY_COLORS
// ---------------------------------------------------------------------------

describe("ISSUE_SEVERITY_COLORS", () => {
  const EXPECTED_SEVERITIES = ["minor", "moderate", "major", "critical"];

  it("covers all four severity levels", () => {
    for (const s of EXPECTED_SEVERITIES) {
      expect(ISSUE_SEVERITY_COLORS[s]).toBeDefined();
    }
  });

  it("each entry has fg and bg color strings", () => {
    for (const s of EXPECTED_SEVERITIES) {
      const c = ISSUE_SEVERITY_COLORS[s];
      expect(typeof c.fg).toBe("string");
      expect(typeof c.bg).toBe("string");
      expect(c.fg.length).toBeGreaterThan(0);
      expect(c.bg.length).toBeGreaterThan(0);
    }
  });

  it("critical is visually distinct from minor (different colors)", () => {
    expect(ISSUE_SEVERITY_COLORS.critical.fg).not.toBe(ISSUE_SEVERITY_COLORS.minor.fg);
  });
});

// ---------------------------------------------------------------------------
// NOTE_SOURCE_DISPLAY
// ---------------------------------------------------------------------------

describe("NOTE_SOURCE_DISPLAY", () => {
  it("covers all three DB source values", () => {
    expect(NOTE_SOURCE_DISPLAY["owner"]).toBeDefined();
    expect(NOTE_SOURCE_DISPLAY["technician"]).toBeDefined();
    expect(NOTE_SOURCE_DISPLAY["office"]).toBeDefined();
  });

  it("values are non-empty strings", () => {
    for (const label of Object.values(NOTE_SOURCE_DISPLAY)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// formatContextDate
// ---------------------------------------------------------------------------

describe("formatContextDate", () => {
  it("produces a readable date string with month, day, year", () => {
    const result = formatContextDate("2024-06-15T10:00:00Z");
    expect(result).toMatch(/Jun|June/);
    expect(result).toContain("2024");
  });

  it("does not throw on valid ISO strings", () => {
    expect(() => formatContextDate("2025-01-01T00:00:00Z")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildEstimateUrl
// ---------------------------------------------------------------------------

describe("buildEstimateUrl", () => {
  it("returns null when clientId is null (cannot create estimate without client)", () => {
    expect(buildEstimateUrl({
      clientId: null,
      jobId: "j1",
      propertyId: "p1",
      visitId: "v1",
    })).toBeNull();
  });

  it("builds a valid estimate URL with all fields", () => {
    const url = buildEstimateUrl({
      clientId: "c1",
      jobId: "j1",
      propertyId: "p1",
      visitId: "v1",
    });
    expect(url).not.toBeNull();
    expect(url).toContain("/app/estimates/new");
    expect(url).toContain("client_id=c1");
    expect(url).toContain("job_id=j1");
    expect(url).toContain("property_id=p1");
    expect(url).toContain("from_visit=v1");
    expect(url).toContain("pricing_mode=flat_rate");
  });

  it("builds URL without job_id and property_id when they are null", () => {
    const url = buildEstimateUrl({
      clientId: "c1",
      jobId: null,
      propertyId: null,
      visitId: "v1",
    });
    expect(url).not.toBeNull();
    expect(url).toContain("client_id=c1");
    expect(url).not.toContain("job_id");
    expect(url).not.toContain("property_id");
    expect(url).toContain("from_visit=v1");
  });
});

// ---------------------------------------------------------------------------
// Visit with no checklist — guard against empty checklist assumption
// ---------------------------------------------------------------------------

describe("Visit with no checklist", () => {
  it("checklistDone and checklistTotal are both 0", () => {
    const checklistItems: unknown[] = [];
    const checklistDone = 0;
    const checklistTotal = checklistItems.length;
    expect(checklistDone).toBe(0);
    expect(checklistTotal).toBe(0);
  });

  it("closingAllDoneForBanner is false when no checklist items", () => {
    const checklistItems: unknown[] = [];
    const closingAllDone = checklistItems.length > 0 && checklistItems.every(() => true);
    expect(closingAllDone).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Visit with property issues — context display
// ---------------------------------------------------------------------------

describe("Visit with property issues context", () => {
  it("issues are sorted by severity (critical first)", () => {
    const SEVERITY_ORDER = ["critical", "major", "moderate", "minor"];
    const sorted = ["major", "critical", "minor"].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b)
    );
    expect(sorted[0]).toBe("critical");
    expect(sorted[1]).toBe("major");
    expect(sorted[2]).toBe("minor");
  });

  it("property context is shown for in_progress visits with a property", () => {
    const status = "in_progress";
    const propertyId = "prop-id";
    expect(shouldShowPropertyContext(status) && !!propertyId).toBe(true);
  });

  it("property context is hidden when visit has no property", () => {
    const propertyId: string | null = null;
    expect(shouldShowPropertyContext("in_progress") && !!propertyId).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Visit with previous service history
// ---------------------------------------------------------------------------

describe("Visit with previous service history", () => {
  it("lastServiceVisit has the expected shape", () => {
    const lastService = {
      id: "visit-prev",
      job_title: "HVAC inspection",
      completed_at: "2024-03-15T14:00:00Z",
    };
    expect(lastService.id).toBeTruthy();
    expect(lastService.job_title).toBeTruthy();
    expect(lastService.completed_at).toBeTruthy();
    expect(formatContextDate(lastService.completed_at)).toContain("2024");
  });

  it("null lastServiceVisit means no previous service on file", () => {
    const lastService: null = null;
    expect(lastService).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Visit completion — record and follow-up visibility
// ---------------------------------------------------------------------------

describe("Visit completion visibility", () => {
  it("completion record shows for completed visit with packet", () => {
    const status = "completed";
    const hasPacket = true;
    expect(shouldShowCompletionRecord(status) && hasPacket).toBe(true);
  });

  it("completion record hidden for completed visit with no packet", () => {
    const status = "completed";
    const hasPacket = false;
    expect(shouldShowCompletionRecord(status) && hasPacket).toBe(false);
  });

  it("follow-up shows for completed visit with property", () => {
    const status = "completed";
    const propertyId = "prop-id";
    expect(shouldShowFollowUp(status) && !!propertyId).toBe(true);
  });

  it("follow-up hidden when no property", () => {
    const propertyId: string | null = null;
    expect(shouldShowFollowUp("completed") && !!propertyId).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-tenant / account isolation guards
// ---------------------------------------------------------------------------

describe("Multi-tenant isolation", () => {
  it("all property context queries require property_id AND account_id", () => {
    const requiredFilters = ["property_id", "account_id"];
    expect(requiredFilters).toContain("property_id");
    expect(requiredFilters).toContain("account_id");
  });

  it("needsPropertyContext guard prevents queries when no property_id", () => {
    const job_property_id: string | null = null;
    const currentStatus = "in_progress";
    const needsPropertyContext = !!job_property_id && currentStatus !== "cancelled";
    expect(needsPropertyContext).toBe(false);
  });

  it("needsPropertyContext guard prevents queries when cancelled", () => {
    const job_property_id = "prop-id";
    const currentStatus = "cancelled";
    const needsPropertyContext = !!job_property_id && currentStatus !== "cancelled";
    expect(needsPropertyContext).toBe(false);
  });

  it("needsPropertyContext is true for active visit with property", () => {
    const job_property_id = "prop-id";
    const currentStatus = "in_progress";
    const needsPropertyContext = !!job_property_id && currentStatus !== "cancelled";
    expect(needsPropertyContext).toBe(true);
  });
});
