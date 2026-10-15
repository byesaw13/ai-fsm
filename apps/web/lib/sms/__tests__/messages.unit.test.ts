import { describe, expect, it } from "vitest";
import {
  confirmReply,
  invoiceReadyText,
  isBareYes,
  nothingToConfirmReply,
  onTheWayText,
  quoteReadyText,
  serviceSmsPhone,
} from "../messages";

describe("serviceSmsPhone", () => {
  it("requires consent and a text preference", () => {
    expect(serviceSmsPhone({ sms_consent: true, preferred_contact: "sms", phone: "(978) 836-7839" })).toBe(
      "+19788367839"
    );
    expect(serviceSmsPhone({ sms_consent: false, preferred_contact: "sms", phone: "9788367839" })).toBeNull();
    expect(serviceSmsPhone({ sms_consent: true, preferred_contact: "email", phone: "9788367839" })).toBeNull();
    expect(serviceSmsPhone({ sms_consent: true, preferred_contact: "sms", phone: "" })).toBeNull();
  });
});

describe("service text copy", () => {
  it("keeps each text to one or two sentences and includes STOP", () => {
    expect(quoteReadyText("AB12CD34", "https://example.com/q")).toMatch(/quote AB12CD34 is ready/);
    expect(quoteReadyText("AB12CD34", "https://example.com/q")).toMatch(/STOP/);
    expect(invoiceReadyText({ number: "1042", amountDueCents: 15000, url: "https://example.com/i", paid: false })).toMatch(
      /\$150\.00/
    );
    expect(invoiceReadyText({ number: "1042", amountDueCents: 0, url: "https://example.com/i", paid: true })).toMatch(
      /receipt/
    );
    expect(onTheWayText({ techName: "Nick Garon", title: "Bath fan", address: "1 Oak St" })).toBe(
      "Dovetails: Nick is on the way for Bath fan at 1 Oak St. Reply STOP to opt out."
    );
    expect(onTheWayText({ techName: null, title: "Bath fan", address: null })).toMatch(/^Dovetails: We are on the way/);
  });
});

describe("appointment YES", () => {
  it("matches a bare yes and ignores a sentence", () => {
    expect(isBareYes("YES")).toBe(true);
    expect(isBareYes("y.")).toBe(true);
    expect(isBareYes("yes that works")).toBe(false);
    expect(confirmReply("Bath fan", "Tuesday")).toMatch(/confirmed for Bath fan on Tuesday/);
    expect(nothingToConfirmReply()).toMatch(/nothing upcoming/);
  });
});
