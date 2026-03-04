/**
 * P8-T6: Export utility unit tests
 *
 * Tests pure CSV formatting functions.  No IO, no DB, no HTTP.
 */

import { describe, it, expect } from "vitest";
import {
  objectsToCsv,
  formatCentsForCsv,
  formatDateForCsv,
  formatExpensesCsv,
  formatInvoicesCsv,
  formatPaymentsCsv,
  formatMileageCsv,
} from "../export";

// ---------------------------------------------------------------------------
// objectsToCsv
// ---------------------------------------------------------------------------

describe("objectsToCsv", () => {
  it("produces a header line matching the supplied headers", () => {
    const csv = objectsToCsv(["Name", "Amount"], []);
    const firstLine = csv.split("\r\n")[0];
    expect(firstLine).toBe("Name,Amount");
  });

  it("ends with a trailing CRLF", () => {
    const csv = objectsToCsv(["A"], [{ A: "1" }]);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("maps row values to columns in header order", () => {
    const csv = objectsToCsv(["X", "Y"], [{ X: "hello", Y: "world" }]);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines[1]).toBe("hello,world");
  });

  it("produces header-only when rows is empty", () => {
    const csv = objectsToCsv(["A", "B"], []);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("A,B");
  });

  it("escapes fields containing commas", () => {
    const csv = objectsToCsv(["Name"], [{ Name: "Smith, John" }]);
    expect(csv).toContain('"Smith, John"');
  });

  it("escapes fields containing double-quotes", () => {
    const csv = objectsToCsv(["Note"], [{ Note: 'say "hi"' }]);
    expect(csv).toContain('"say ""hi"""');
  });

  it("escapes fields containing newlines", () => {
    const csv = objectsToCsv(["Note"], [{ Note: "line1\nline2" }]);
    expect(csv).toContain('"line1\nline2"');
  });

  it("outputs empty string for null values", () => {
    const csv = objectsToCsv(["A"], [{ A: null }]);
    // Split without filter(Boolean) — null fields produce an empty data line
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("");
  });

  it("outputs empty string for undefined values", () => {
    const csv = objectsToCsv(["A"], [{}]);
    // Split without filter(Boolean) — missing key produces an empty data line
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("");
  });

  it("handles multiple rows", () => {
    const csv = objectsToCsv(
      ["A"],
      [{ A: "first" }, { A: "second" }, { A: "third" }]
    );
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[1]).toBe("first");
    expect(lines[3]).toBe("third");
  });
});

// ---------------------------------------------------------------------------
// formatCentsForCsv
// ---------------------------------------------------------------------------

describe("formatCentsForCsv", () => {
  it("formats zero as $0.00", () => {
    expect(formatCentsForCsv(0)).toBe("$0.00");
  });

  it("formats positive cents correctly", () => {
    expect(formatCentsForCsv(1050)).toBe("$10.50");
  });

  it("formats large amounts correctly", () => {
    expect(formatCentsForCsv(100000)).toBe("$1000.00");
  });

  it("formats negative cents with leading minus", () => {
    expect(formatCentsForCsv(-500)).toBe("-$5.00");
  });

  it("handles null as $0.00", () => {
    expect(formatCentsForCsv(null)).toBe("$0.00");
  });

  it("handles string cents", () => {
    expect(formatCentsForCsv("2500")).toBe("$25.00");
  });
});

// ---------------------------------------------------------------------------
// formatDateForCsv
// ---------------------------------------------------------------------------

describe("formatDateForCsv", () => {
  it("returns YYYY-MM-DD from an ISO date string", () => {
    expect(formatDateForCsv("2026-03-15")).toBe("2026-03-15");
  });

  it("truncates ISO timestamp to date", () => {
    expect(formatDateForCsv("2026-03-15T12:34:56.000Z")).toBe("2026-03-15");
  });

  it("returns empty string for null", () => {
    expect(formatDateForCsv(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDateForCsv(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatExpensesCsv
// ---------------------------------------------------------------------------

describe("formatExpensesCsv", () => {
  const row = {
    expense_date: "2026-03-10",
    vendor_name: "Acme Hardware",
    category: "materials",
    amount_cents: 4999,
    job_title: "Roof Repair",
    notes: "nails and screws",
  };

  it("includes standard column headers", () => {
    const csv = formatExpensesCsv([row]);
    const header = csv.split("\r\n")[0];
    expect(header).toContain("Date");
    expect(header).toContain("Vendor");
    expect(header).toContain("Category");
    expect(header).toContain("Amount");
  });

  it("formats amount as dollars", () => {
    const csv = formatExpensesCsv([row]);
    expect(csv).toContain("$49.99");
  });

  it("formats date as YYYY-MM-DD", () => {
    const csv = formatExpensesCsv([row]);
    expect(csv).toContain("2026-03-10");
  });

  it("includes vendor name", () => {
    const csv = formatExpensesCsv([row]);
    expect(csv).toContain("Acme Hardware");
  });

  it("returns header-only for empty array", () => {
    const csv = formatExpensesCsv([]);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// formatInvoicesCsv
// ---------------------------------------------------------------------------

describe("formatInvoicesCsv", () => {
  const row = {
    invoice_number: "INV-0042",
    client_name: "Jane Doe",
    status: "paid",
    subtotal_cents: 90000,
    tax_cents: 9000,
    total_cents: 99000,
    paid_cents: 99000,
    due_date: "2026-03-31",
    created_at: "2026-03-01T09:00:00.000Z",
  };

  it("includes invoice number in output", () => {
    const csv = formatInvoicesCsv([row]);
    expect(csv).toContain("INV-0042");
  });

  it("includes client name", () => {
    const csv = formatInvoicesCsv([row]);
    expect(csv).toContain("Jane Doe");
  });

  it("includes status", () => {
    const csv = formatInvoicesCsv([row]);
    expect(csv).toContain("paid");
  });

  it("formats total as dollars", () => {
    const csv = formatInvoicesCsv([row]);
    expect(csv).toContain("$990.00");
  });

  it("formats created_at as date only", () => {
    const csv = formatInvoicesCsv([row]);
    expect(csv).toContain("2026-03-01");
  });

  it("returns header-only for empty array", () => {
    const csv = formatInvoicesCsv([]);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// formatPaymentsCsv
// ---------------------------------------------------------------------------

describe("formatPaymentsCsv", () => {
  const row = {
    invoice_number: "INV-0001",
    amount_cents: 25000,
    method: "check",
    received_at: "2026-03-20T00:00:00.000Z",
    notes: "check #4512",
  };

  it("includes invoice number", () => {
    const csv = formatPaymentsCsv([row]);
    expect(csv).toContain("INV-0001");
  });

  it("formats amount as dollars", () => {
    const csv = formatPaymentsCsv([row]);
    expect(csv).toContain("$250.00");
  });

  it("includes payment method", () => {
    const csv = formatPaymentsCsv([row]);
    expect(csv).toContain("check");
  });

  it("includes received date", () => {
    const csv = formatPaymentsCsv([row]);
    expect(csv).toContain("2026-03-20");
  });

  it("returns header-only for empty array", () => {
    const csv = formatPaymentsCsv([]);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// formatMileageCsv
// ---------------------------------------------------------------------------

describe("formatMileageCsv", () => {
  const row = {
    trip_date: "2026-03-12",
    purpose: "Site inspection",
    miles: 47.3,
    job_title: "HVAC Install",
    notes: "",
  };

  it("includes date", () => {
    const csv = formatMileageCsv([row]);
    expect(csv).toContain("2026-03-12");
  });

  it("includes miles", () => {
    const csv = formatMileageCsv([row]);
    expect(csv).toContain("47.3");
  });

  it("includes purpose", () => {
    const csv = formatMileageCsv([row]);
    expect(csv).toContain("Site inspection");
  });

  it("returns header-only for empty array", () => {
    const csv = formatMileageCsv([]);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});
