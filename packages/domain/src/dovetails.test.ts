import { describe, it, expect } from "vitest";
import { invoiceDueOnCompletion, resolveIssueDueDate } from "./dovetails";

describe("invoiceDueOnCompletion (TASK-078)", () => {
  it("is true for a standard/final invoice on an open job", () => {
    for (const jobStatus of ["draft", "quoted", "scheduled", "in_progress"]) {
      expect(invoiceDueOnCompletion({ invoiceKind: "standard", jobStatus })).toBe(true);
      expect(invoiceDueOnCompletion({ invoiceKind: "final", jobStatus })).toBe(true);
    }
  });

  it("is false once the job is completed/invoiced (work done)", () => {
    expect(invoiceDueOnCompletion({ invoiceKind: "standard", jobStatus: "completed" })).toBe(false);
    expect(invoiceDueOnCompletion({ invoiceKind: "final", jobStatus: "invoiced" })).toBe(false);
  });

  it("is false for a deposit invoice (due now) even on an open job", () => {
    expect(invoiceDueOnCompletion({ invoiceKind: "deposit", jobStatus: "in_progress" })).toBe(false);
  });

  it("is false for a jobless/ad-hoc invoice (no job to complete)", () => {
    expect(invoiceDueOnCompletion({ invoiceKind: "standard", jobStatus: null })).toBe(false);
    expect(invoiceDueOnCompletion({ invoiceKind: "standard", jobStatus: undefined })).toBe(false);
  });
});

describe("resolveIssueDueDate (TASK-078)", () => {
  const now = "2026-07-23T15:00:00.000Z";

  it("returns null (due on completion) for a standard invoice on an open job", () => {
    expect(
      resolveIssueDueDate({ invoiceKind: "standard", jobStatus: "in_progress", now }),
    ).toBeNull();
  });

  it("returns the completion day (today) for a deposit invoice", () => {
    const d = resolveIssueDueDate({ invoiceKind: "deposit", jobStatus: "in_progress", now });
    expect(d).not.toBeNull();
    expect(new Date(d!).toLocaleDateString("en-CA", { timeZone: "America/New_York" })).toBe("2026-07-23");
  });

  it("returns a date for a jobless invoice and for a completed job", () => {
    expect(resolveIssueDueDate({ invoiceKind: "standard", jobStatus: null, now })).not.toBeNull();
    expect(resolveIssueDueDate({ invoiceKind: "standard", jobStatus: "completed", now })).not.toBeNull();
  });

  it("an explicit provided due date always wins", () => {
    const provided = "2026-08-01T00:00:00.000Z";
    expect(
      resolveIssueDueDate({ providedDueDate: provided, invoiceKind: "standard", jobStatus: "in_progress", now }),
    ).toBe(provided);
  });
});
