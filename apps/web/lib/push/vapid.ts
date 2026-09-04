/**
 * VAPID configuration for Web Push (EPIC-005 TASK-118).
 *
 * Reads keys from env (see lib/env.ts). Push is optional: if any key is missing
 * the feature is disabled — the public-key endpoint returns none and sends
 * no-op. Configures the `web-push` library exactly once.
 */
import webpush from "web-push";
import { getEnv } from "@/lib/env";

let configured = false;

/** True when all VAPID env is present and web-push is ready to send. */
export function isPushConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export function getVapidPublicKey(): string | null {
  return getEnv().VAPID_PUBLIC_KEY ?? null;
}

/** Configure web-push (idempotent). Returns the library, or null if unconfigured. */
export function getWebPush(): typeof webpush | null {
  if (!isPushConfigured()) return null;
  if (!configured) {
    const env = getEnv();
    webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return webpush;
}
