import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { buildInvoicePdf, buildEstimatePdf } from "../document-pdf";

/** A valid PDF byte stream begins with the "%PDF-" magic header. */
function isPdf(bytes: Uint8Array): boolean {
  const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
  return header === "%PDF-";
}

/**
 * pdf-lib Flate-compresses content streams and encodes drawn text as hex
 * strings (`<48656C6C6F> Tj`). Inflate + decode so tests can assert on labels.
 */
function pdfDrawnText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const streams: string[] = [];
  const marker = Buffer.from("stream\n");
  const endMarker = Buffer.from("\nendstream");
  let from = 0;
  while (from < raw.length) {
    const start = raw.indexOf(marker, from);
    if (start < 0) break;
    const dataStart = start + marker.length;
    const end = raw.indexOf(endMarker, dataStart);
    if (end < 0) break;
    const chunk = raw.subarray(dataStart, end);
    try {
      streams.push(inflateSync(chunk).toString("latin1"));
    } catch {
      /* not a flate stream (e.g. binary image / xref) */
    }
    from = end + endMarker.length;
  }
  const joined = streams.join("\n");
  const decoded: string[] = [];
  for (const m of joined.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = m[1];
    if (hex.length % 2 !== 0) continue;
    let s = "";
    for (let i = 0; i < hex.length; i += 2) {
      s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    decoded.push(s);
  }
  return decoded.join("\n");
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

  it("does not put internal workflow status on the customer-facing PDF", async () => {
    const bytes = await buildInvoicePdf({
      invoiceNumber: "DHS-STATUS-1",
      status: "sent",
      clientName: "Status Check Client",
      issueDate: "2026-04-11",
      dueDate: "2026-05-11",
      subtotalCents: 10000,
      totalCents: 10000,
      paidCents: 0,
      lineItems: [
        { description: "Labor", quantity: 1, unitPriceCents: 10000, totalCents: 10000 },
      ],
    });
    const text = pdfDrawnText(bytes);
    // Invoice number still present for the customer.
    expect(text).toContain("DHS-STATUS-1");
    // Workflow labels must not appear (previously rendered as uppercase status).
    expect(text.split("\n")).not.toContain("SENT");
    expect(text.split("\n")).not.toContain("DRAFT");
    expect(text.split("\n")).not.toContain("PARTIAL");
    expect(text.split("\n")).not.toContain("OVERDUE");
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

  it("renders a paid invoice with stamp and payment terms", async () => {
    const bytes = await buildInvoicePdf({
      invoiceNumber: "DHS-PAID-1",
      status: "paid",
      clientName: "Paid Client",
      clientEmail: "paid@example.com",
      propertyAddress: "12 Oak St, Concord NH 03301",
      issueDate: "2026-06-01",
      dueDate: "2026-06-15",
      paidAt: "2026-06-10",
      subtotalCents: 50000,
      totalCents: 50000,
      paidCents: 50000,
      notes: "Thank you.",
      lineItems: [
        { description: "Service call", quantity: 1, unitPriceCents: 50000, totalCents: 50000 },
      ],
      branding: {
        name: "Dovetails Services LLC",
        invoiceTerms: "Payment is due on receipt.",
      },
    });
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1500);
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
