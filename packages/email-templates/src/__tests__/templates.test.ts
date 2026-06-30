import { describe, expect, it } from "vitest";
import {
  bookingConfirmedEmailHtml,
  bookingConfirmedHtml,
  clientReactivationHtml,
  estimateEmailHtml,
  estimateEmailText,
  estimateFollowupHtml,
  intakeInviteEmailHtml,
  intakeInviteEmailText,
  invoiceEmailHtml,
  invoiceEmailText,
  invoiceFollowupEmailHtml,
  invoiceFollowupHtml,
  onMyWayEmailHtml,
  recurringInspectionHtml,
  reviewRequestEmailHtml,
  reviewRequestHtml,
  seasonalReminderHtml,
  visitReminderEmailHtml,
  visitReminderHtml,
} from "../index.js";

describe("canonical email template snapshots", () => {
  it("invoiceEmailHtml", () => {
    expect(
      invoiceEmailHtml({
        invoiceNumber: "INV-1001",
        clientName: "Jane Doe",
        totalCents: 150000,
        balanceCents: 75000,
        dueDateStr: "July 15, 2026",
        viewUrl: "https://example.test/invoices/inv-1001",
        notes: "Thank you for your business.",
      }),
    ).toMatchSnapshot();
  });

  it("invoiceEmailText", () => {
    expect(
      invoiceEmailText({
        invoiceNumber: "INV-1001",
        clientName: "Jane Doe",
        totalCents: 150000,
        balanceCents: 75000,
        dueDateStr: "July 15, 2026",
        viewUrl: "https://example.test/invoices/inv-1001",
        notes: null,
      }),
    ).toMatchSnapshot();
  });

  it("invoiceFollowupEmailHtml", () => {
    expect(
      invoiceFollowupEmailHtml({
        clientName: "Jane Doe",
        invoiceNumber: "INV-1001",
        totalCents: 150000,
        balanceCents: 75000,
        daysOverdue: 7,
        viewUrl: "https://example.test/invoices/inv-1001",
      }),
    ).toMatchSnapshot();
  });

  it("estimateEmailHtml", () => {
    expect(
      estimateEmailHtml({
        estimateRef: "EST-42",
        clientName: "Jane Doe",
        totalCents: 100000,
        depositCents: 30000,
        balanceCents: 70000,
        expiresStr: "August 1, 2026",
        notes: "Includes materials.",
        approveUrl: "https://example.test/approve",
        declineUrl: "https://example.test/decline",
        viewUrl: "https://example.test/view",
      }),
    ).toMatchSnapshot();
  });

  it("estimateEmailText", () => {
    expect(
      estimateEmailText({
        estimateRef: "EST-42",
        clientName: "Jane Doe",
        totalCents: 100000,
        depositCents: 0,
        balanceCents: 100000,
        expiresStr: null,
        notes: null,
        approveUrl: "https://example.test/approve",
        declineUrl: "https://example.test/decline",
        viewUrl: "https://example.test/view",
      }),
    ).toMatchSnapshot();
  });

  it("estimateFollowupHtml", () => {
    expect(
      estimateFollowupHtml({
        clientName: "Jane Doe",
        estimateNumber: "EST-42",
        totalCents: 100000,
        daysSinceSent: 3,
        viewUrl: "https://example.test/estimates/est-42",
      }),
    ).toMatchSnapshot();
  });

  it("visitReminderEmailHtml", () => {
    expect(
      visitReminderEmailHtml({
        clientName: "Jane Doe",
        jobTitle: "Kitchen Repair",
        scheduledStart: "2026-07-15T14:00:00.000Z",
        propertyAddress: "123 Main St",
        techName: "Alex Tech",
      }),
    ).toMatchSnapshot();
  });

  it("onMyWayEmailHtml", () => {
    expect(
      onMyWayEmailHtml({
        clientName: "Jane Doe",
        jobTitle: "Kitchen Repair",
        when: "Tuesday, July 15, 2026, 10:00 AM",
        propertyAddress: "123 Main St",
        techName: "Alex Tech",
      }),
    ).toMatchSnapshot();
  });

  it("bookingConfirmedEmailHtml", () => {
    expect(
      bookingConfirmedEmailHtml({
        clientName: "Jane Doe",
        jobTitle: "Kitchen Repair",
        scheduledStart: "2026-07-15T14:00:00.000Z",
        scheduledEnd: "2026-07-15T16:00:00.000Z",
        propertyAddress: "123 Main St",
        techName: "Alex Tech",
      }),
    ).toMatchSnapshot();
  });

  it("intakeInviteEmailHtml", () => {
    expect(
      intakeInviteEmailHtml({
        leadName: "Jane Doe",
        intakeUrl: "https://example.test/intake/token-abc",
        expiresHours: 48,
      }),
    ).toMatchSnapshot();
  });

  it("intakeInviteEmailText", () => {
    expect(
      intakeInviteEmailText({
        leadName: "Jane Doe",
        intakeUrl: "https://example.test/intake/token-abc",
      }),
    ).toMatchSnapshot();
  });

  it("reviewRequestEmailHtml", () => {
    expect(
      reviewRequestEmailHtml({
        clientName: "Jane Doe",
        jobTitle: "Kitchen Repair",
        techName: "Alex Tech",
      }),
    ).toMatchSnapshot();
  });

  it("clientReactivationHtml", () => {
    expect(
      clientReactivationHtml({
        clientName: "Jane Doe",
        monthsSinceLastService: 6,
      }),
    ).toMatchSnapshot();
  });

  it("seasonalReminderHtml spring", () => {
    expect(
      seasonalReminderHtml({
        clientName: "Jane Doe",
        season: "spring",
      }),
    ).toMatchSnapshot();
  });

  it("seasonalReminderHtml fall", () => {
    expect(
      seasonalReminderHtml({
        clientName: "Jane Doe",
        season: "fall",
      }),
    ).toMatchSnapshot();
  });

  it("recurringInspectionHtml", () => {
    expect(
      recurringInspectionHtml({
        clientName: "Jane Doe",
        planName: "Gold Maintenance",
        propertyAddress: "123 Main St",
      }),
    ).toMatchSnapshot();
  });
});

describe("deprecated worker aliases re-export canonical", () => {
  const followupData = {
    clientName: "Jane Doe",
    invoiceNumber: "INV-1001",
    totalCents: 150000,
    balanceCents: 75000,
    daysOverdue: 7,
    viewUrl: "https://example.test/invoices/inv-1001",
  };

  const bookingData = {
    clientName: "Jane Doe",
    jobTitle: "Kitchen Repair",
    scheduledStart: "2026-07-15T14:00:00.000Z",
    scheduledEnd: "2026-07-15T16:00:00.000Z",
    propertyAddress: "123 Main St",
    techName: "Alex Tech",
  };

  const reviewData = {
    clientName: "Jane Doe",
    jobTitle: "Kitchen Repair",
    techName: "Alex Tech",
  };

  it("invoiceFollowupHtml === invoiceFollowupEmailHtml", () => {
    expect(invoiceFollowupHtml(followupData)).toBe(invoiceFollowupEmailHtml(followupData));
  });

  it("bookingConfirmedHtml === bookingConfirmedEmailHtml", () => {
    expect(bookingConfirmedHtml(bookingData)).toBe(bookingConfirmedEmailHtml(bookingData));
  });

  it("reviewRequestHtml === reviewRequestEmailHtml", () => {
    expect(reviewRequestHtml(reviewData)).toBe(reviewRequestEmailHtml(reviewData));
  });

  it("visitReminderHtml delegates to visitReminderEmailHtml for ISO scheduledStart", () => {
    const data = {
      clientName: "Jane Doe",
      jobTitle: "Kitchen Repair",
      when: "2026-07-15T14:00:00.000Z",
      propertyAddress: "123 Main St",
      techName: "Alex Tech",
    };
    expect(visitReminderHtml(data)).toBe(
      visitReminderEmailHtml({
        clientName: data.clientName,
        jobTitle: data.jobTitle,
        scheduledStart: data.when,
        propertyAddress: data.propertyAddress,
        techName: data.techName,
      }),
    );
  });
});