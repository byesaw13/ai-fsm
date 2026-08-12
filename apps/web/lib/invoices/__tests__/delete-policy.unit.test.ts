import { describe, it, expect } from "vitest";
import {
  canOwnerHardDeleteInvoice,
  ownerHardDeleteInvoiceBlockReason,
} from "../delete-policy";

describe("canOwnerHardDeleteInvoice", () => {
  it("allows draft / sent / overdue / void with no payments", () => {
    for (const status of ["draft", "sent", "overdue", "void"] as const) {
      expect(canOwnerHardDeleteInvoice({ status, paid_cents: 0 })).toBe(true);
      expect(ownerHardDeleteInvoiceBlockReason({ status, paid_cents: 0 })).toBeNull();
    }
  });

  it("blocks paid or partial regardless of paid_cents edge cases", () => {
    expect(canOwnerHardDeleteInvoice({ status: "paid", paid_cents: 0 })).toBe(false);
    expect(canOwnerHardDeleteInvoice({ status: "partial", paid_cents: 100 })).toBe(false);
  });

  it("blocks any status with paid_cents > 0", () => {
    expect(canOwnerHardDeleteInvoice({ status: "sent", paid_cents: 1 })).toBe(false);
    expect(ownerHardDeleteInvoiceBlockReason({ status: "sent", paid_cents: 1 })).toMatch(
      /payments/i
    );
  });
});
