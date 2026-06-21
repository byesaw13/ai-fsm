import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptJson, decryptJson, isEncryptionConfigured } from "@/lib/crypto";

const KEY = randomBytes(32).toString("base64");

describe("crypto (AES-256-GCM)", () => {
  const prev = process.env.APP_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = prev;
  });

  it("round-trips an object", () => {
    const value = { accessToken: "sq-secret", webhookSignatureKey: "whk-123" };
    const blob = encryptJson(value);
    expect(Buffer.isBuffer(blob)).toBe(true);
    expect(decryptJson(blob)).toEqual(value);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const a = encryptJson({ x: 1 });
    const b = encryptJson({ x: 1 });
    expect(a.equals(b)).toBe(false);
  });

  it("fails to decrypt tampered ciphertext (auth tag)", () => {
    const blob = encryptJson({ x: 1 });
    blob[blob.length - 1] ^= 0xff; // flip a byte
    expect(() => decryptJson(blob)).toThrow();
  });

  it("reports configured when key is set", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });

  it("reports not configured and throws when key is missing", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptJson({ x: 1 })).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("rejects a key that is not 32 bytes", () => {
    process.env.APP_ENCRYPTION_KEY = "too-short";
    expect(() => encryptJson({ x: 1 })).toThrow(/32 bytes/);
  });
});
