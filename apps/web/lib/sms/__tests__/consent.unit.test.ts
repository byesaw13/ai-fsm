import { describe, expect, it } from "vitest";
import { SMS_CONSENT_TEXT, SMS_SAMPLE_MESSAGES } from "../consent";

describe("SMS_CONSENT_TEXT", () => {
  it("includes CTIA / A2P required disclosures", () => {
    const t = SMS_CONSENT_TEXT.toLowerCase();
    expect(t).toContain("dovetails");
    expect(t).toContain("message");
    expect(t).toMatch(/rates may apply|message and data rates/);
    expect(t).toContain("stop");
    expect(t).toContain("help");
    expect(t).toMatch(/frequency|varies/);
    expect(t).toMatch(/terms|privacy/);
  });

  it("provides sample messages for Twilio registration", () => {
    expect(SMS_SAMPLE_MESSAGES.length).toBeGreaterThanOrEqual(2);
    for (const msg of SMS_SAMPLE_MESSAGES) {
      expect(msg.toLowerCase()).toMatch(/stop|dovetails/);
    }
  });
});
