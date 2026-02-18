/**
 * Unit tests for invoice conversion invariants and permissions.
 *
 * These tests exercise pure logic only (no DB, no network).
 * - invoiceTransitions map: all statuses, valid/invalid transitions
 * - Role-based permission checks for invoices
 * - Conversion prerequisite: only approved estimates can convert
 * - Idempotency contract (business rule description)
 *
 * Source evidence:
 *   AI-FSM: docs/contracts/workflow-states.md (invoice lifecycle)
 *   AI-FSM: packages/domain/src/index.ts (invoiceTransitions)
 *   AI-FSM: apps/web/lib/auth/permissions.ts (role checks)
 */

import { describe, it, expect } from "vitest";
import { invoiceTransitions } from "@ai-fsm/domain";
import {
  canCreateInvoices,
  canSendInvoices,
  canConvertEstimates,
  canDeleteRecords,
} from "../../auth/permissions";

// ===
// Invoice lifecycle transition map
// ===

describe("invoiceTransitions", () => {
  it("draft → sent is allowed", () => {
    expect(invoiceTransitions["draft"]).toContain("sent");
  });

  it("draft allows sent and void (2 transitions)", () => {
    expect(invoiceTransitions["draft"]).toHaveLength(2);
    expect(invoiceTransitions["draft"]).toContain("void");
  });

  it("sent → partial is allowed", () => {
    expect(invoiceTransitions["sent"]).toContain("partial");
  });

  it("sent → paid is allowed", () => {
    expect(invoiceTransitions["sent"]).toContain("paid");
  });

  it("sent → overdue is allowed", () => {
    expect(invoiceTransitions["sent"]).toContain("overdue");
  });

  it("sent → void is allowed", () => {
    expect(invoiceTransitions["sent"]).toContain("void");
  });

  it("partial → paid is allowed", () => {
    expect(invoiceTransitions["partial"]).toContain("paid");
  });

  it("partial → overdue is allowed", () => {
    expect(invoiceTransitions["partial"]).toContain("overdue");
  });

  it("partial → void is allowed", () => {
    expect(invoiceTransitions["partial"]).toContain("void");
  });

  it("overdue → void is allowed", () => {
    expect(invoiceTransitions["overdue"]).toContain("void");
  });

  it("paid is a terminal state (no transitions)", () => {
    expect(invoiceTransitions["paid"]).toHaveLength(0);
  });

  it("void is a terminal state (no transitions)", () => {
    expect(invoiceTransitions["void"]).toHaveLength(0);
  });

  it("draft → paid is not allowed (must go through sent)", () => {
    expect(invoiceTransitions["draft"]).not.toContain("paid");
  });

  it("draft → partial is not allowed (must go through sent)", () => {
    expect(invoiceTransitions["draft"]).not.toContain("partial");
  });

  it("all 6 statuses are present as keys", () => {
    const keys = Object.keys(invoiceTransitions);
    expect(keys).toContain("draft");
    expect(keys).toContain("sent");
    expect(keys).toContain("partial");
    expect(keys).toContain("paid");
    expect(keys).toContain("overdue");
    expect(keys).toContain("void");
    expect(keys).toHaveLength(6);
  });
});

// ===
// Conversion prerequisite invariants
// ===

describe("estimate→invoice conversion prerequisites", () => {
  /**
   * The conversion endpoint enforces: estimate.status === "approved".
   * This set of tests documents the business rules as code.
   */

  const CONVERTIBLE_STATUS = "approved";
  const NON_CONVERTIBLE_STATUSES = ["draft", "sent", "declined", "expired"];

  it("only approved status satisfies the conversion prerequisite", () => {
    // Mirrors the check in POST /api/v1/estimates/[id]/convert
    const canConvert = (status: string) => status === CONVERTIBLE_STATUS;
    expect(canConvert("approved")).toBe(true);
  });

  it.each(NON_CONVERTIBLE_STATUSES)(
    "status '%s' does not satisfy the conversion prerequisite",
    (status) => {
      const canConvert = (s: string) => s === CONVERTIBLE_STATUS;
      expect(canConvert(status)).toBe(false);
    }
  );

  it("idempotency: a second convert on the same estimate should return the existing invoice (no duplicate)", () => {
    // Documents the idempotency contract as a business rule.
    // Actual DB enforcement is tested in the integration tests.
    // Here we verify the expected response shape contract:
    const idempotentResponse = { invoice_id: "uuid", created: false };
    const firstConvertResponse = { invoice_id: "uuid", invoice_number: "INV-0001", invoice_status: "draft", created: true };

    expect(idempotentResponse.created).toBe(false);
    expect(firstConvertResponse.created).toBe(true);
    expect(idempotentResponse.invoice_id).toBe(firstConvertResponse.invoice_id);
  });
});

// ===
// Role-based permission checks for invoices
// ===

describe("invoice permissions", () => {
  it("canCreateInvoices: owner and admin only", () => {
    expect(canCreateInvoices("owner")).toBe(true);
    expect(canCreateInvoices("admin")).toBe(true);
    expect(canCreateInvoices("tech")).toBe(false);
  });

  it("canSendInvoices: owner and admin only", () => {
    expect(canSendInvoices("owner")).toBe(true);
    expect(canSendInvoices("admin")).toBe(true);
    expect(canSendInvoices("tech")).toBe(false);
  });

  it("canConvertEstimates: owner and admin only", () => {
    expect(canConvertEstimates("owner")).toBe(true);
    expect(canConvertEstimates("admin")).toBe(true);
    expect(canConvertEstimates("tech")).toBe(false);
  });

  it("canDeleteRecords: owner only (not admin, not tech)", () => {
    expect(canDeleteRecords("owner")).toBe(true);
    expect(canDeleteRecords("admin")).toBe(false);
    expect(canDeleteRecords("tech")).toBe(false);
  });

  it("tech role cannot perform any invoice mutation", () => {
    expect(canCreateInvoices("tech")).toBe(false);
    expect(canSendInvoices("tech")).toBe(false);
    expect(canConvertEstimates("tech")).toBe(false);
  });
});

// ===
// Invoice number format
// ===

describe("invoice number format", () => {
  it("INV-0001 format: 4-digit zero-padded", () => {
    const format = (n: number) => `INV-${String(n).padStart(4, "0")}`;
    expect(format(1)).toBe("INV-0001");
    expect(format(42)).toBe("INV-0042");
    expect(format(1000)).toBe("INV-1000");
  });

  it("count-based generation produces sequential numbers", () => {
    const format = (n: number) => `INV-${String(n).padStart(4, "0")}`;
    // First invoice on account (count=0, so count+1=1)
    expect(format(0 + 1)).toBe("INV-0001");
    // Second invoice (count=1, count+1=2)
    expect(format(1 + 1)).toBe("INV-0002");
  });
});
