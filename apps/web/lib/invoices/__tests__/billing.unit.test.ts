import { describe, it, expect } from "vitest";
import { reconcileFinalInvoice } from "../billing";

describe("reconcileFinalInvoice — canonical deposit/final model", () => {
  it("no deposit: final invoice carries the full total, no credit, no note", () => {
    const r = reconcileFinalInvoice({ invoiceTotalCents: 200000, depositInvoices: [] });
    expect(r.invoiceTotalCents).toBe(200000);
    expect(r.depositCreditCents).toBe(0);
    expect(r.balanceDueCents).toBe(200000);
    expect(r.reconciliationNote).toBeNull();
  });

  it("single deposit: credits the deposit and reduces balance (no double billing)", () => {
    const r = reconcileFinalInvoice({
      invoiceTotalCents: 200000,
      depositInvoices: [{ invoice_number: "INV-0001", total_cents: 50000, status: "sent" }],
    });
    expect(r.depositCreditCents).toBe(50000);
    expect(r.balanceDueCents).toBe(150000);
    // deposit (50000) + final balance (150000) === project total (200000)
    expect(r.depositCreditCents + r.balanceDueCents).toBe(200000);
    expect(r.reconciliationNote).toContain("INV-0001");
    expect(r.reconciliationNote).toContain("$1,500.00");
  });

  it("voided deposit is NOT credited (it was never collectible)", () => {
    const r = reconcileFinalInvoice({
      invoiceTotalCents: 200000,
      depositInvoices: [{ invoice_number: "INV-0001", total_cents: 50000, status: "void" }],
    });
    expect(r.depositCreditCents).toBe(0);
    expect(r.balanceDueCents).toBe(200000);
    expect(r.reconciliationNote).toBeNull();
  });

  it("mixed deposits: only non-void deposits count", () => {
    const r = reconcileFinalInvoice({
      invoiceTotalCents: 300000,
      depositInvoices: [
        { invoice_number: "INV-0001", total_cents: 50000, status: "void" },
        { invoice_number: "INV-0002", total_cents: 75000, status: "paid" },
      ],
    });
    expect(r.depositCreditCents).toBe(75000);
    expect(r.balanceDueCents).toBe(225000);
    expect(r.reconciliationNote).toContain("INV-0002");
    expect(r.reconciliationNote).not.toContain("INV-0001");
  });

  it("deposit equal to total: balance is zero, never negative", () => {
    const r = reconcileFinalInvoice({
      invoiceTotalCents: 100000,
      depositInvoices: [{ invoice_number: "INV-0001", total_cents: 100000, status: "paid" }],
    });
    expect(r.depositCreditCents).toBe(100000);
    expect(r.balanceDueCents).toBe(0);
  });

  it("deposit larger than total clamps the credit so balance stays at zero", () => {
    const r = reconcileFinalInvoice({
      invoiceTotalCents: 100000,
      depositInvoices: [{ invoice_number: "INV-0001", total_cents: 150000, status: "paid" }],
    });
    expect(r.depositCreditCents).toBe(100000); // clamped to total
    expect(r.balanceDueCents).toBe(0);
  });

  it("the deposit and final invoice always sum to the project total (property)", () => {
    for (const [total, dep] of [
      [200000, 50000],
      [99999, 25000],
      [150000, 0],
      [180000, 180000],
    ] as const) {
      const deposits = dep > 0 ? [{ invoice_number: "INV-X", total_cents: dep, status: "sent" }] : [];
      const r = reconcileFinalInvoice({ invoiceTotalCents: total, depositInvoices: deposits });
      expect(r.depositCreditCents + r.balanceDueCents).toBe(total);
    }
  });
});
