import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

// AES-256-GCM encryption for secrets stored at rest (e.g. payment-provider
// access tokens in integration_settings). The key comes from the environment
// and never lives in the database. Ciphertext layout (single Buffer / bytea):
//
//   [ iv (12 bytes) ][ auth tag (16 bytes) ][ ciphertext ]
//
// This keeps everything in one column with no separate IV/tag bookkeeping.

const IV_LENGTH = 12; // GCM standard nonce length
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256

/**
 * Resolve the 32-byte encryption key from APP_ENCRYPTION_KEY.
 * Accepts a base64 or hex string, or a raw 32-char passphrase.
 * Throws if unset or the wrong length — fail loud rather than store
 * secrets under a weak/absent key.
 */
function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not configured — required to store provider secrets"
    );
  }

  // Try base64, then hex, then raw utf8 — pick whichever yields 32 bytes.
  for (const enc of ["base64", "hex"] as const) {
    try {
      const buf = Buffer.from(raw, enc);
      if (buf.length === KEY_LENGTH) return buf;
    } catch {
      // try next encoding
    }
  }

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === KEY_LENGTH) return utf8;

  throw new Error(
    "APP_ENCRYPTION_KEY must decode to 32 bytes (e.g. `openssl rand -base64 32`)"
  );
}

/** Encrypt an arbitrary JSON-serializable value into a single Buffer. */
export function encryptJson(value: unknown): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/** Decrypt a Buffer produced by {@link encryptJson} back into its value. */
export function decryptJson<T = unknown>(payload: Buffer): T {
  const key = getKey();
  if (payload.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Ciphertext too short to be valid");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

/** Whether an encryption key is configured (for status checks / guards). */
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
