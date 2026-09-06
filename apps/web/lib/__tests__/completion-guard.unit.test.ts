import { describe, expect, it } from "vitest";
import { checkCompletionPacket, isQuickJobPacketExempt } from "../completion-guard";

describe("checkCompletionPacket", () => {
  it("requires a packet with at least one photo", () => {
    expect(checkCompletionPacket(null)).toEqual({ ok: false, error: "MISSING_PHOTO" });
    expect(checkCompletionPacket({
      photo_urls: [],
      signature_url: "https://example.com/signature.png",
      signature_waiver: false,
    })).toEqual({ ok: false, error: "MISSING_PHOTO" });
  });

  it("requires a signature or waiver", () => {
    expect(checkCompletionPacket({
      photo_urls: ["https://example.com/photo.jpg"],
      signature_url: null,
      signature_waiver: false,
    })).toEqual({ ok: false, error: "MISSING_SIGNATURE" });
  });

  it("passes with a photo and signature URL", () => {
    expect(checkCompletionPacket({
      photo_urls: ["https://example.com/photo.jpg"],
      signature_url: "https://example.com/signature.png",
      signature_waiver: false,
    })).toEqual({ ok: true });
  });

  it("passes with a photo and signature waiver", () => {
    expect(checkCompletionPacket({
      photo_urls: ["https://example.com/photo.jpg"],
      signature_url: null,
      signature_waiver: true,
    })).toEqual({ ok: true });
  });

  it("returns ok when photos_waived even with empty photo_urls", () => {
    expect(checkCompletionPacket({
      photo_urls: [],
      signature_url: null,
      signature_waiver: true,
      photos_waived: true,
      photos_waiver_reason: "Forgot",
    })).toEqual({ ok: true });
  });

  it("still requires photo if not waived", () => {
    expect(checkCompletionPacket({
      photo_urls: [],
      signature_url: null,
      signature_waiver: true,
      photos_waived: false,
    })).toEqual({ ok: false, error: "MISSING_PHOTO" });
  });

  it("waiver satisfies photo but does not bypass signature requirement (full waiver flow case)", () => {
    expect(checkCompletionPacket({
      photo_urls: [],
      signature_url: null,
      signature_waiver: false,
      photos_waived: true,
      photos_waiver_reason: "Client declined photos",
    })).toEqual({ ok: false, error: "MISSING_SIGNATURE" });
  });

  it("quick job (no estimate): photo not required, signature not required", () => {
    expect(checkCompletionPacket(null, { requirePhoto: false, requireSignature: false })).toEqual({
      ok: true,
    });
    expect(
      checkCompletionPacket(
        { photo_urls: [], signature_url: null, signature_waiver: false },
        { requirePhoto: false, requireSignature: false },
      ),
    ).toEqual({ ok: true });
  });

  it("quick job still accepts a photo if one was taken", () => {
    expect(
      checkCompletionPacket(
        {
          photo_urls: ["https://example.com/photo.jpg"],
          signature_url: null,
          signature_waiver: false,
        },
        { requirePhoto: false, requireSignature: false },
      ),
    ).toEqual({ ok: true });
  });
});

describe("isQuickJobPacketExempt", () => {
  it("is true for a standard work-order visit with no estimate (quick-book shape)", () => {
    expect(
      isQuickJobPacketExempt({
        visit_type: "standard",
        work_order_id: "wo-1",
        has_estimate: false,
      }),
    ).toBe(true);
  });

  it("is false for a site_visit even when there is no estimate", () => {
    expect(
      isQuickJobPacketExempt({
        visit_type: "site_visit",
        work_order_id: null,
        has_estimate: false,
      }),
    ).toBe(false);
  });

  it("is false when the job already has an estimate", () => {
    expect(
      isQuickJobPacketExempt({
        visit_type: "standard",
        work_order_id: "wo-1",
        has_estimate: true,
      }),
    ).toBe(false);
  });

  it("is false for a standard visit with no work order", () => {
    expect(
      isQuickJobPacketExempt({
        visit_type: "standard",
        work_order_id: null,
        has_estimate: false,
      }),
    ).toBe(false);
  });
});
