import { describe, expect, it } from "vitest";
import {
  billFollowupText,
  bookingConfirmedText,
  noticeTarget,
  quoteFollowupText,
  reviewRequestText,
  serviceTextPhone,
  visitReminderText,
} from "./customer.js";

const textable = {
  client_phone: "+19788367839",
  sms_consent: true,
  preferred_contact: "sms",
};

describe("serviceTextPhone", () => {
  it("texts only a consented customer who prefers sms", () => {
    expect(serviceTextPhone(textable)).toBe("+19788367839");
    expect(serviceTextPhone({ ...textable, preferred_contact: "email" })).toBeNull();
    expect(serviceTextPhone({ ...textable, sms_consent: false })).toBeNull();
  });
});

describe("noticeTarget", () => {
  it("prefers a text over email, and falls back to email", () => {
    expect(noticeTarget(textable, "a@b.com")).toEqual({ channel: "sms", to: "+19788367839" });
    expect(noticeTarget({ ...textable, sms_consent: false }, "a@b.com")).toEqual({
      channel: "email",
      to: "a@b.com",
    });
    expect(noticeTarget({ sms_consent: false, preferred_contact: "email", client_phone: null }, null)).toBeNull();
  });
});

describe("service copy", () => {
  it("includes STOP and a confirm ask on the reminder", () => {
    expect(visitReminderText("Bath fan", "Tuesday at 9:00 AM", "1 Oak St")).toMatch(/Reply YES to confirm/);
    expect(visitReminderText("Bath fan", "Tuesday at 9:00 AM", "1 Oak St")).toMatch(/STOP/);
    expect(bookingConfirmedText("Bath fan", "Tuesday", null)).toMatch(/booked for Tuesday/);
    expect(quoteFollowupText(10000, "https://example.com/q")).toMatch(/\$100\.00/);
    expect(billFollowupText("1042", 2500, null)).toMatch(/invoice 1042/);
    expect(reviewRequestText("Bath fan")).toMatch(/how did Bath fan go/);
  });
});
