import Link from "next/link";
import type { Route } from "next";
import { SMS_CONSENT_TEXT } from "@/lib/sms/consent";

/**
 * Checkbox label for SMS opt-in. Includes CTIA-required disclosures and
 * links to Terms + Privacy. Caller owns the checkbox (not pre-checked).
 */
export function SmsConsentLabel({
  muted = false,
  plainTextFallback = false,
}: {
  muted?: boolean;
  /** When true, render plain text only (for non-JS / email-style contexts). */
  plainTextFallback?: boolean;
}) {
  if (plainTextFallback) {
    return (
      <span style={{ fontSize: 13, color: muted ? "#9ca3af" : "#374151", lineHeight: 1.45 }}>
        {SMS_CONSENT_TEXT}
      </span>
    );
  }

  return (
    <span style={{ fontSize: 13, color: muted ? "#9ca3af" : "#374151", lineHeight: 1.45 }}>
      By checking this box, you agree to receive text messages from{" "}
      <strong>Dovetails Services LLC</strong> about your service requests, appointments,
      estimates, and related account updates. Message frequency varies. Message and data rates may
      apply. Reply <strong>STOP</strong> to opt out, <strong>HELP</strong> for help. View our{" "}
      <Link href={"/terms" as Route} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href={"/privacy" as Route} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
        Privacy Policy
      </Link>
      .
    </span>
  );
}
