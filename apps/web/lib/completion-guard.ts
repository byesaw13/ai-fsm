export interface CompletionPacket {
  photo_urls: string[];
  signature_url: string | null;
  signature_waiver: boolean;
  photos_waived?: boolean;
  photos_waiver_reason?: string | null;
}

export type CompletionGuardError = "MISSING_PHOTO" | "MISSING_SIGNATURE";

export function checkCompletionPacket(
  packet: CompletionPacket | null
): { ok: boolean; error?: CompletionGuardError } {
  if (!packet || (packet.photo_urls.length === 0 && !packet.photos_waived)) {
    return { ok: false, error: "MISSING_PHOTO" };
  }
  if (!packet.signature_url && !packet.signature_waiver) {
    return { ok: false, error: "MISSING_SIGNATURE" };
  }
  return { ok: true };
}
