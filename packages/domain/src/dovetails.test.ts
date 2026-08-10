import { describe, it, expect } from "vitest";
import {
  invoiceDueOnCompletion,
  resolveIssueDueDate,
  daysUntilInvoiceDue,
  isInvoiceCalendarOverdue,
  calendarDaysOverdue,
  dueDateUponCompletion,
} from "./dovetails";

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

describe("calendar-day invoice overdue (due-upon-completion same-day send)", () => {
  // due_date stamped as local midnight Eastern for 2026-08-10
  const dueSameDay = dueDateUponCompletion("2026-08-10T17:53:36.000Z"); // afternoon send
  // afternoon same day Eastern (= 21:00 UTC during EDT)
  const afternoonSameDay = "2026-08-10T21:00:00.000Z";
  // next calendar day Eastern morning
  const nextMorning = "2026-08-11T12:00:00.000Z";

  it("same calendar day is not overdue even after local midnight due stamp", () => {
    expect(daysUntilInvoiceDue(dueSameDay, afternoonSameDay)).toBe(0);
    expect(isInvoiceCalendarOverdue(dueSameDay, afternoonSameDay)).toBe(false);
    expect(calendarDaysOverdue(dueSameDay, afternoonSameDay)).toBe(0);
  });

  it("next calendar day is 1 day overdue", () => {
    expect(daysUntilInvoiceDue(dueSameDay, nextMorning)).toBe(-1);
    expect(isInvoiceCalendarOverdue(dueSameDay, nextMorning)).toBe(true);
    expect(calendarDaysOverdue(dueSameDay, nextMorning)).toBe(1);
  });

  it("instant comparison would wrongly flag same-day (documenting the bug we fixed)", () => {
    // dueSameDay is midnight ET ≈ 04:00Z; afternoon is later → due < now
    expect(new Date(dueSameDay).getTime() < new Date(afternoonSameDay).getTime()).toBe(true);
    // but calendar rule says not overdue
    expect(isInvoiceCalendarOverdue(dueSameDay, afternoonSameDay)).toBe(false);
  });

  it("null due date is not overdue", () => {
    expect(daysUntilInvoiceDue(null, afternoonSameDay)).toBeNull();
    expect(isInvoiceCalendarOverdue(null, afternoonSameDay)).toBe(false);
    expect(calendarDaysOverdue(null, afternoonSameDay)).toBe(0);
  });

  it("future due date is positive days until due", () => {
    const dueFuture = dueDateUponCompletion("2026-08-20T15:00:00.000Z");
    expect(daysUntilInvoiceDue(dueFuture, afternoonSameDay)).toBe(10);
    expect(isInvoiceCalendarOverdue(dueFuture, afternoonSameDay)).toBe(false);
  });

  it("UTC-midnight ISO from date pickers keeps the UTC calendar day", () => {
    // Picked 2026-08-20 → often stored as 2026-08-20T00:00:00.000Z
    const picker = "2026-08-20T00:00:00.000Z";
    // Afternoon ET on Aug 20 must not treat as Aug 19 (overdue)
    expect(daysUntilInvoiceDue(picker, "2026-08-20T21:00:00.000Z")).toBe(0);
    expect(isInvoiceCalendarOverdue(picker, "2026-08-20T21:00:00.000Z")).toBe(false);
    expect(isInvoiceCalendarOverdue(picker, "2026-08-21T12:00:00.000Z")).toBe(true);
  });
});
