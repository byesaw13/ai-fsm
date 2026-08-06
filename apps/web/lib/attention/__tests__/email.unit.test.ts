import { describe, expect, it } from "vitest";
import { emailIdempotencyBucket } from "../email";
import { ATTENTION_EMAIL_TYPES, ATTENTION_EVENT_TYPES } from "../types";

describe("emailIdempotencyBucket", () => {
  it("floors to 15-minute UTC buckets", () => {
    // 2026-08-03T12:07:30Z → floor to 12:00
    const a = emailIdempotencyBucket(new Date("2026-08-03T12:07:30.000Z"));
    const b = emailIdempotencyBucket(new Date("2026-08-03T12:14:59.000Z"));
    const c = emailIdempotencyBucket(new Date("2026-08-03T12:15:00.000Z"));
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    // consecutive buckets differ by 1
    expect(Number(c) - Number(a)).toBe(1);
  });
});

describe("ATTENTION_EMAIL_TYPES", () => {
  it("emails high-signal types only (not partial, not opens spam)", () => {
    expect(ATTENTION_EMAIL_TYPES).toContain("invoice.opened");
    expect(ATTENTION_EMAIL_TYPES).toContain("invoice.paid");
    expect(ATTENTION_EMAIL_TYPES).toContain("estimate.approved");
    expect(ATTENTION_EMAIL_TYPES).toContain("estimate.declined");
    expect(ATTENTION_EMAIL_TYPES as readonly string[]).not.toContain("invoice.partial");
    expect(ATTENTION_EMAIL_TYPES as readonly string[]).not.toContain("estimate.opened");
    expect(ATTENTION_EMAIL_TYPES as readonly string[]).not.toContain("booking_request.created");
  });

  it("only includes known event types", () => {
    for (const t of ATTENTION_EMAIL_TYPES) {
      expect(ATTENTION_EVENT_TYPES as readonly string[]).toContain(t);
    }
  });
});
