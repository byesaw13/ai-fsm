/**
 * Unit tests for profitability reporting helpers.
 *
 * Tier: Unit (Tier 1) — no DB, no network.
 *
 * Source evidence:
 *   AI-FSM: apps/web/lib/reports/profitability.ts
 *   AI-FSM: apps/web/lib/auth/permissions.ts (canViewReports)
 */

import { describe, it, expect } from "vitest";
import {
  formatCents,
  netRevenueCents,
  jobNetCents,
  jobProfitabilityStatus,
  isValidMonth,
  resolveMonth,
  sumCents,
  outstandingCents,
} from "../profitability";
import { canViewReports } from "../../auth/permissions";

// ============================================================================
// formatCents
// ============================================================================

describe("formatCents", () => {
  it("formats zero correctly", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("formats positive cents", () => {
    expect(formatCents(10000)).toBe("$100.00");
  });

  it("formats cents with fractional dollars", () => {
    expect(formatCents(1234)).toBe("$12.34");
  });

  it("formats negative cents with leading minus", () => {
    expect(formatCents(-500)).toBe("-$5.00");
  });

  it("formats large values", () => {
    expect(formatCents(1000000)).toBe("$10,000.00");
  });

  it("formats one cent", () => {
    expect(formatCents(1)).toBe("$0.01");
  });
});

// ============================================================================
// netRevenueCents
// ============================================================================

describe("netRevenueCents", () => {
  it("returns positive net when revenue exceeds expenses", () => {
    expect(netRevenueCents(50000, 10000)).toBe(40000);
  });

  it("returns negative net when expenses exceed revenue", () => {
    expect(netRevenueCents(5000, 10000)).toBe(-5000);
  });

  it("returns zero when equal", () => {
    expect(netRevenueCents(10000, 10000)).toBe(0);
  });

  it("returns revenue when no expenses", () => {
    expect(netRevenueCents(25000, 0)).toBe(25000);
  });
});

// ============================================================================
// jobNetCents
// ============================================================================

describe("jobNetCents", () => {
  it("computes job net profit", () => {
    expect(jobNetCents(30000, 5000)).toBe(25000);
  });

  it("returns negative for unprofitable job", () => {
    expect(jobNetCents(1000, 2000)).toBe(-1000);
  });

  it("returns zero when revenue equals expenses", () => {
    expect(jobNetCents(5000, 5000)).toBe(0);
  });
});

// ============================================================================
// jobProfitabilityStatus
// ============================================================================

describe("jobProfitabilityStatus", () => {
  it("returns 'complete' when invoice count > 0", () => {
    expect(jobProfitabilityStatus(1)).toBe("complete");
    expect(jobProfitabilityStatus(3)).toBe("complete");
  });

  it("returns 'partial' when no invoices linked", () => {
    expect(jobProfitabilityStatus(0)).toBe("partial");
  });
});

// ============================================================================
// isValidMonth
// ============================================================================

describe("isValidMonth", () => {
  it("accepts valid YYYY-MM format", () => {
    expect(isValidMonth("2026-03")).toBe(true);
    expect(isValidMonth("2025-12")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidMonth("2026-3")).toBe(false);
    expect(isValidMonth("March 2026")).toBe(false);
    expect(isValidMonth("")).toBe(false);
    expect(isValidMonth("2026")).toBe(false);
  });
});

// ============================================================================
// resolveMonth
// ============================================================================

describe("resolveMonth", () => {
  it("returns provided month if valid", () => {
    expect(resolveMonth("2026-01")).toBe("2026-01");
  });

  it("returns current month if null provided", () => {
    const result = resolveMonth(null);
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  it("returns current month if invalid string provided", () => {
    const result = resolveMonth("not-a-month");
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  it("returns current month if undefined", () => {
    const result = resolveMonth(undefined);
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ============================================================================
// sumCents
// ============================================================================

describe("sumCents", () => {
  it("sums an array of cent values", () => {
    expect(sumCents([1000, 2000, 500])).toBe(3500);
  });

  it("returns 0 for empty array", () => {
    expect(sumCents([])).toBe(0);
  });

  it("handles single value", () => {
    expect(sumCents([9999])).toBe(9999);
  });
});

// ============================================================================
// outstandingCents
// ============================================================================

describe("outstandingCents", () => {
  it("excludes paid invoices from outstanding", () => {
    const rows = [
      { status: "paid", total_cents: 10000, paid_cents: 10000 },
      { status: "sent", total_cents: 5000, paid_cents: 0 },
    ];
    expect(outstandingCents(rows)).toBe(5000);
  });

  it("excludes void invoices", () => {
    const rows = [
      { status: "void", total_cents: 8000, paid_cents: 0 },
      { status: "overdue", total_cents: 3000, paid_cents: 500 },
    ];
    expect(outstandingCents(rows)).toBe(2500);
  });

  it("returns 0 when all invoices paid", () => {
    const rows = [
      { status: "paid", total_cents: 10000, paid_cents: 10000 },
    ];
    expect(outstandingCents(rows)).toBe(0);
  });

  it("handles partial payments in outstanding", () => {
    const rows = [
      { status: "partial", total_cents: 10000, paid_cents: 4000 },
    ];
    expect(outstandingCents(rows)).toBe(6000);
  });

  it("handles empty array", () => {
    expect(outstandingCents([])).toBe(0);
  });
});

// ============================================================================
// Permissions
// ============================================================================

describe("canViewReports", () => {
  it("owner can view reports", () => expect(canViewReports("owner")).toBe(true));
  it("admin can view reports", () => expect(canViewReports("admin")).toBe(true));
  it("tech cannot view reports", () => expect(canViewReports("tech")).toBe(false));
});
