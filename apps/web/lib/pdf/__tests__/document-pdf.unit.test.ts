import { describe, it, expect } from "vitest";
import { buildInvoicePdf, buildEstimatePdf } from "../document-pdf";

/** A valid PDF byte stream begins with the "%PDF-" magic header. */
function isPdf(bytes: Uint8Array): boolean {
  const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
  return header === "%PDF-";
}

describe("buildInvoicePdf", () => {
  it("produces a valid PDF for a normal invoice", async () => {
    const bytes = await buildInvoicePdf({
      invoiceNumber: "DHS-KTW-187-INV",
      status: "partial",
      clientName: "Kim Tufts Wells",
      clientEmail: "kim@example.com",
      jobTitle: "Custom loft + carpentry",
      propertyAddress: "187 Webhannet, Wells ME",
      issueDate: "2026-04-11",
      dueDate: "2026-05-11",
      subtotalCents: 675968,
      taxCents: 0,
      totalCents: 675968,
      paidCents: 200000,
      notes: "60 hours custom carpentry. Deposit received.",
      lineItems: [
        { description: "Custom loft + carpentry — 60 hrs labor + materials", quantity: 1, unitPriceCents: 675968, totalCents: 675968 },
      ],
    });
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("handles zero payments, no notes, and empty line items", async () => {
    const bytes = await buildInvoicePdf({
      invoiceNumber: "X-1",
      status: "draft",
      clientName: null,
      totalCents: 0,
      subtotalCents: 0,
      paidCents: 0,
      lineItems: [],
    });
    expect(isPdf(bytes)).toBe(true);
  });

  it("wraps very long descriptions across multiple lines without throwing", async () => {
    const long = "Repair ".repeat(80).trim();
    const bytes = await buildInvoicePdf({
      invoiceNumber: "X-2",
      status: "sent",
      clientName: "Someone",
      subtotalCents: 10000,
      totalCents: 10000,
      paidCents: 0,
      lineItems: Array.from({ length: 40 }, (_, i) => ({
        description: `${i}: ${long}`,
        quantity: 2.5,
        unitPriceCents: 4000,
        totalCents: 10000,
      })),
    });
    expect(isPdf(bytes)).toBe(true);
  });
});

describe("buildEstimatePdf", () => {
  it("renders multi-option estimates from option groups (parent total is 0)", async () => {
    const bytes = await buildEstimatePdf({
      estimateRef: "MULTI001",
      status: "sent",
      clientName: "Option Client",
      issueDate: "2026-01-01",
      // Parent totals are intentionally zero for multi_option estimates.
      subtotalCents: 0,
      totalCents: 0,
      lineItems: [],
      options: [
        {
          label: "Good",
          description: "Budget scope",
          isRecommended: false,
          totalCents: 250000,
          lineItems: [{ description: "Basic paint", quantity: 1, unitPriceCents: 250000, totalCents: 250000 }],
        },
        {
          label: "Better",
          isRecommended: true,
          totalCents: 400000,
          lineItems: [{ description: "Premium paint + trim", quantity: 1, unitPriceCents: 400000, totalCents: 400000 }],
        },
      ],
    });
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("produces a valid PDF with a deposit line", async () => {
    const bytes = await buildEstimatePdf({
      estimateRef: "ABCD1234",
      status: "sent",
      clientName: "Jon & Stacy Colman",
      jobTitle: "Interior painting Phase 1",
      issueDate: "2025-08-20",
      expiresDate: "2025-09-20",
      subtotalCents: 643900,
      totalCents: 643900,
      depositCents: 200000,
      notes: "6-room interior paint with ceilings.",
      lineItems: [
        { description: "6-room interior paint with ceilings", quantity: 1, unitPriceCents: 643900, totalCents: 643900 },
      ],
    });
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
