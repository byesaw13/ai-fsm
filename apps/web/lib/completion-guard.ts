export interface CompletionPacket {
  photo_urls: string[];
  signature_url: string | null;
  signature_waiver: boolean;
  photos_waived?: boolean;
  photos_waiver_reason?: string | null;
}

export type CompletionGuardError = "MISSING_PHOTO" | "MISSING_SIGNATURE";

export type CompletionGuardOptions = {
  /** Default true. Quick (no-estimate) jobs skip photos. */
  requirePhoto?: boolean;
  /** Default true. Quick jobs skip signature — My Day Complete has no sign UI. */
  requireSignature?: boolean;
};

export function checkCompletionPacket(
  packet: CompletionPacket | null,
  options: CompletionGuardOptions = {},
): { ok: boolean; error?: CompletionGuardError } {
  const requirePhoto = options.requirePhoto !== false;
  const requireSignature = options.requireSignature !== false;

  if (requirePhoto && (!packet || (packet.photo_urls.length === 0 && !packet.photos_waived))) {
    return { ok: false, error: "MISSING_PHOTO" };
  }
  if (requireSignature && (!packet || (!packet.signature_url && !packet.signature_waiver))) {
    return { ok: false, error: "MISSING_SIGNATURE" };
  }
  return { ok: true };
}
