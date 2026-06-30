import { describe, expect, it } from "vitest";
import { checkCompletionPacket } from "../completion-guard";

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
});
