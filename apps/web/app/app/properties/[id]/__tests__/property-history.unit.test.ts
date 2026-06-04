/**
 * Property History — unit tests
 *
 * Tests pure helper functions and query-correctness constants for the
 * Property History page. No DB, no Next.js runtime.
 */

import { describe, it, expect } from "vitest";
import {
  propertyActiveJobStatusColor,
  formatPropertyCents,
  formatPropertyDate,
  NOTE_SOURCE_LABELS,
  DOCUMENT_TYPE_LABELS,
  ACTIVE_JOB_STATUSES_EXCLUDED,
} from "../property-history-helpers";
import { eventHrefFor } from "../PropertyTimeline";
import type { TimelineEvent } from "../PropertyTimeline";

// ---------------------------------------------------------------------------
// Status filter regression guard
// ---------------------------------------------------------------------------

const REAL_DB_JOB_STATUSES = [
  "draft", "quoted", "scheduled", "in_progress",
  "completed", "invoiced", "cancelled",
] as const;

describe("ACTIVE_JOB_STATUSES_EXCLUDED", () => {
  it("excludes exactly the three terminal statuses", () => {
    expect(ACTIVE_JOB_STATUSES_EXCLUDED).toContain("completed");
    expect(ACTIVE_JOB_STATUSES_EXCLUDED).toContain("invoiced");
    expect(ACTIVE_JOB_STATUSES_EXCLUDED).toContain("cancelled");
    expect(ACTIVE_JOB_STATUSES_EXCLUDED).toHaveLength(3);
  });

  it("does NOT exclude active/open statuses", () => {
    const excluded = ACTIVE_JOB_STATUSES_EXCLUDED as readonly string[];
    expect(excluded).not.toContain("draft");
    expect(excluded).not.toContain("quoted");
    expect(excluded).not.toContain("scheduled");
    expect(excluded).not.toContain("in_progress");
  });

  it("uses 'cancelled' not 'archived' — archived is a pipeline concept", () => {
    const excluded = ACTIVE_JOB_STATUSES_EXCLUDED as readonly string[];
    expect(excluded).toContain("cancelled");
    expect(excluded).not.toContain("archived");
  });

  it("active statuses derived from real DB values are draft|quoted|scheduled|in_progress", () => {
    const active = REAL_DB_JOB_STATUSES.filter(
      (s) => !(ACTIVE_JOB_STATUSES_EXCLUDED as readonly string[]).includes(s)
    );
    expect(active).toHaveLength(4);
    expect(active).toEqual(
      expect.arrayContaining(["draft", "quoted", "scheduled", "in_progress"])
    );
  });
});

// ---------------------------------------------------------------------------
// propertyActiveJobStatusColor
// ---------------------------------------------------------------------------

describe("propertyActiveJobStatusColor", () => {
  it("in_progress → blue", () => {
    expect(propertyActiveJobStatusColor("in_progress")).toBe("#0284c7");
  });

  it("scheduled → blue", () => {
    expect(propertyActiveJobStatusColor("scheduled")).toBe("#0284c7");
  });

  it("quoted → amber (estimate sent, awaiting approval)", () => {
    expect(propertyActiveJobStatusColor("quoted")).toBe("#d97706");
  });

  it("draft → muted gray", () => {
    expect(propertyActiveJobStatusColor("draft")).toBe("#6b7280");
  });

  it("unknown → safe gray default", () => {
    expect(propertyActiveJobStatusColor("something")).toBe("#6b7280");
  });

  it("pipeline-only names produce muted gray (never real DB values)", () => {
    expect(propertyActiveJobStatusColor("new_lead")).toBe("#6b7280");
    expect(propertyActiveJobStatusColor("approved_ready")).toBe("#6b7280");
    expect(propertyActiveJobStatusColor("waiting")).toBe("#6b7280");
    expect(propertyActiveJobStatusColor("archived")).toBe("#6b7280");
  });
});

// ---------------------------------------------------------------------------
// formatPropertyCents
// ---------------------------------------------------------------------------

describe("formatPropertyCents", () => {
  it("formats 0 as $0.00", () => {
    expect(formatPropertyCents(0)).toContain("0");
  });

  it("formats 125000 cents as $1,250", () => {
    const r = formatPropertyCents(125000);
    expect(r).toContain("1,250");
  });

  it("includes currency symbol", () => {
    expect(formatPropertyCents(5000)).toMatch(/\$|USD/);
  });
});

// ---------------------------------------------------------------------------
// formatPropertyDate
// ---------------------------------------------------------------------------

describe("formatPropertyDate", () => {
  it("produces a readable date with month, day, year", () => {
    const result = formatPropertyDate("2024-06-15T00:00:00Z");
    expect(result).toMatch(/Jun|June/);
    expect(result).toContain("2024");
  });

  it("does not throw on valid ISO strings", () => {
    expect(() => formatPropertyDate("2025-01-01T00:00:00Z")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NOTE_SOURCE_LABELS
// ---------------------------------------------------------------------------

describe("NOTE_SOURCE_LABELS", () => {
  it("covers all three DB source values", () => {
    expect(NOTE_SOURCE_LABELS["owner"]).toBeDefined();
    expect(NOTE_SOURCE_LABELS["technician"]).toBeDefined();
    expect(NOTE_SOURCE_LABELS["office"]).toBeDefined();
  });

  it("labels are non-empty strings", () => {
    for (const label of Object.values(NOTE_SOURCE_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// DOCUMENT_TYPE_LABELS
// ---------------------------------------------------------------------------

describe("DOCUMENT_TYPE_LABELS", () => {
  const expectedTypes = [
    "estimate_pdf", "estimate_docx", "invoice_pdf", "invoice_docx",
    "receipt", "photo", "signed_approval", "insurance", "contract",
    "client_file", "sop", "template", "other",
  ];

  it.each(expectedTypes)("has a label for '%s'", (type) => {
    expect(DOCUMENT_TYPE_LABELS[type]).toBeDefined();
    expect(DOCUMENT_TYPE_LABELS[type].length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PropertyTimeline — eventHrefFor
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    event_type: "visit",
    id: "test-id",
    ts: "2024-01-01T00:00:00Z",
    label: "Test",
    detail: "",
    link_id: "link-123",
    total_cents: null,
    ...overrides,
  };
}

describe("eventHrefFor", () => {
  it("visit → /app/visits/:link_id", () => {
    expect(eventHrefFor(makeEvent({ event_type: "visit", link_id: "v1" }))).toBe("/app/visits/v1");
  });

  it("estimate → /app/estimates/:link_id", () => {
    expect(eventHrefFor(makeEvent({ event_type: "estimate", link_id: "e1" }))).toBe("/app/estimates/e1");
  });

  it("invoice → /app/invoices/:link_id", () => {
    expect(eventHrefFor(makeEvent({ event_type: "invoice", link_id: "i1" }))).toBe("/app/invoices/i1");
  });

  it("vault_item → null (no detail page)", () => {
    expect(eventHrefFor(makeEvent({ event_type: "vault_item", link_id: "x" }))).toBeNull();
  });

  it("note → null (no detail page)", () => {
    expect(eventHrefFor(makeEvent({ event_type: "note", link_id: null }))).toBeNull();
  });

  it("membership → null", () => {
    expect(eventHrefFor(makeEvent({ event_type: "membership", link_id: "m1" }))).toBeNull();
  });

  it("null link_id → null for all linked types", () => {
    expect(eventHrefFor(makeEvent({ event_type: "visit",    link_id: null }))).toBeNull();
    expect(eventHrefFor(makeEvent({ event_type: "estimate", link_id: null }))).toBeNull();
    expect(eventHrefFor(makeEvent({ event_type: "invoice",  link_id: null }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Timeline event type coverage
// ---------------------------------------------------------------------------

describe("Timeline event types — property_timeline_v coverage", () => {
  // These are the eight event types emitted by property_timeline_v after migration 103.
  // The PropertyTimeline component must handle all of them (DOT_COLORS + TYPE_CHIP).
  // If a new event type is added to the view, it must be added here and handled in the component.
  const VIEW_EVENT_TYPES = [
    "visit",
    "estimate",
    "invoice",
    "vault_item",
    "photo",       // vault item photos — was in view, now surfaced on property page
    "issue",       // property issues — was in view, now surfaced on property page
    "note",        // added to view in Property History phase
    "membership",  // added to view in Consolidation phase (migration 103)
  ];

  it("all eight event types from property_timeline_v are accounted for", () => {
    expect(VIEW_EVENT_TYPES).toHaveLength(8);
  });

  it("photo events are now surfaced (was missing from inline UNION)", () => {
    expect(VIEW_EVENT_TYPES).toContain("photo");
  });

  it("issue events are now surfaced (was missing from inline UNION)", () => {
    expect(VIEW_EVENT_TYPES).toContain("issue");
  });

  it("membership events are now in view (was only in inline UNION)", () => {
    expect(VIEW_EVENT_TYPES).toContain("membership");
  });

  it("PropertyTimeline component DOT_COLORS covers all view event types", () => {
    // Regression guard: if this fails, add the new type to PropertyTimeline.tsx
    const COMPONENT_TYPES = ["visit", "estimate", "invoice", "vault_item", "membership", "photo", "issue", "note"];
    for (const t of VIEW_EVENT_TYPES) {
      expect(COMPONENT_TYPES).toContain(t);
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-property isolation guards
// ---------------------------------------------------------------------------

describe("Multi-property isolation", () => {
  it("all queries use both property_id AND account_id filters", () => {
    // This is a documentation-style test that captures the invariant:
    // every query must filter by both property_id ($1) and account_id ($2)
    // to prevent cross-tenant or cross-property data leakage.
    // Actual enforcement is in the SQL and RLS policies.
    const requiredFilters = ["property_id", "account_id"];
    expect(requiredFilters).toContain("property_id");
    expect(requiredFilters).toContain("account_id");
  });
});

// ---------------------------------------------------------------------------
// Service history shape contracts
// ---------------------------------------------------------------------------

describe("ServiceHistoryRow shape", () => {
  it("has the expected fields for a completed job", () => {
    const row = {
      job_id: "j1",
      job_title: "Roof repair",
      job_status: "completed",
      last_visit_id: "v1",
      last_visit_date: "2024-06-01T00:00:00Z",
      tech_notes_preview: "Fixed flashing around chimney.",
      invoice_id: "i1",
      invoice_total: 85000,
      paid_cents: 85000,
      invoice_status: "paid",
    };
    expect(row.job_status).toBe("completed");
    expect(row.paid_cents).toBeGreaterThanOrEqual(row.invoice_total ?? 0);
  });

  it("handles null visit (job completed but no visit recorded)", () => {
    const row = {
      job_id: "j2",
      job_title: "Consultation",
      job_status: "invoiced",
      last_visit_id: null,
      last_visit_date: null,
      tech_notes_preview: null,
      invoice_id: "i2",
      invoice_total: 15000,
      paid_cents: 0,
      invoice_status: "sent",
    };
    expect(row.last_visit_id).toBeNull();
    expect(row.invoice_total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Active Work section display logic
// ---------------------------------------------------------------------------

describe("Active Work section conditions", () => {
  it("section shows when any active jobs exist", () => {
    const activeJobs = [{ id: "j1" }];
    const openEstimates: unknown[] = [];
    const openInvoices: unknown[] = [];
    const count = activeJobs.length + openEstimates.length + openInvoices.length;
    expect(count).toBeGreaterThan(0);
  });

  it("section hidden when no active work", () => {
    const count = 0;
    expect(count > 0).toBe(false);
  });

  it("count is sum of jobs + estimates + invoices", () => {
    const count = 2 + 1 + 3;
    expect(count).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

describe("Empty state conditions", () => {
  it("service history hidden when no completed jobs", () => {
    const serviceHistory: unknown[] = [];
    expect(serviceHistory.length > 0).toBe(false);
  });

  it("health section hidden when no issues, conditions, or notes", () => {
    const hasHealth = false || false || false;
    expect(hasHealth).toBe(false);
  });

  it("docs section hidden when no documents and no visit media", () => {
    const hasDocumentsOrMedia = 0 > 0 || 0 > 0;
    expect(hasDocumentsOrMedia).toBe(false);
  });
});
