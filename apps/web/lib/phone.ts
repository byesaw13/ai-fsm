/**
 * Normalize a phone number to E.164 so the same person always maps to one
 * client record (e.g. "+1 (555) 123-4567" and "5551234567" → "+15551234567").
 *
 * US-first (the Dovetails market): 10-digit and 1+10-digit numbers become
 * "+1XXXXXXXXXX". Numbers already written in "+<country><national>" form are
 * preserved when they look like valid E.164 (11–15 digits). Anything else —
 * short codes, malformed, empty — returns null so callers skip client
 * lookup/creation for it.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Preserve already-international E.164 (must have been written with a +)
  if (hasPlus && digits.length >= 11 && digits.length <= 15) return `+${digits}`;

  return null;
}
