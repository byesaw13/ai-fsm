import { describe, it, expect } from "vitest";
import { formatPhoneDisplay, normalizePhone } from "../phone";

describe("normalizePhone", () => {
  it("normalizes a 10-digit US number", () => {
    expect(normalizePhone("5551234567")).toBe("+15551234567");
  });

  it("normalizes a formatted US number", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("555.123.4567")).toBe("+15551234567");
  });

  it("normalizes an 11-digit number with leading 1", () => {
    expect(normalizePhone("15551234567")).toBe("+15551234567");
    expect(normalizePhone("1-555-123-4567")).toBe("+15551234567");
  });

  it("treats the same person written different ways as equal", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe(normalizePhone("5551234567"));
  });

  it("preserves a valid international E.164 number", () => {
    expect(normalizePhone("+447911123456")).toBe("+447911123456");
  });

  it("returns null for short codes and junk", () => {
    expect(normalizePhone("22000")).toBeNull();
    expect(normalizePhone("847291")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
});

describe("formatPhoneDisplay", () => {
  it("formats US numbers and leaves others alone", () => {
    expect(formatPhoneDisplay("+16035550142")).toBe("(603) 555-0142");
    expect(formatPhoneDisplay("603.555.0142")).toBe("(603) 555-0142");
    expect(formatPhoneDisplay("+447700900123")).toBe("+447700900123");
    expect(formatPhoneDisplay(null)).toBe("");
  });
});
