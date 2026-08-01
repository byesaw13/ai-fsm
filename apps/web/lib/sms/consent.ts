/**
 * CTIA / A2P 10DLC SMS consent copy — single source of truth for booking,
 * staff intake, stored consent text, and Twilio campaign registration.
 *
 * Keep disclosures accurate: program description, frequency, rates, STOP/HELP,
 * and links to Terms + Privacy. Never pre-check the consent checkbox.
 */

export const BUSINESS_LEGAL_NAME = "Dovetails Services LLC";
export const BUSINESS_PHONE_DISPLAY = "(603) 479-1094";
export const BUSINESS_PHONE_E164 = "+16034791094";
export const BUSINESS_SUPPORT_EMAIL = "hello@mydovetails.com";
export const PUBLIC_APP_ORIGIN = "https://app.mydovetails.com";

/** Plain-text consent shown next to the opt-in checkbox (and stored on clients). */
export const SMS_CONSENT_TEXT =
  "By checking this box, you agree to receive text messages from Dovetails Services LLC about your service requests, appointments, estimates, and related account updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. See Terms of Service and Privacy Policy.";

/** Shorter line for dense UIs; still includes STOP/HELP/rates. */
export const SMS_CONSENT_TEXT_SHORT =
  "I agree to receive texts from Dovetails Services LLC about my service. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";

/** Sample messages for Twilio A2P campaign registration. */
export const SMS_SAMPLE_MESSAGES = [
  "Dovetails: Thanks for your request — we'll review it within 1 business day. Reply STOP to opt out, HELP for help.",
  "Dovetails: Your estimate is ready. View it here: https://app.mydovetails.com/portal/… Reply STOP to opt out.",
  "Dovetails: Reminder — site visit tomorrow 9–11am. Need to reschedule? Reply to this text. STOP to opt out.",
] as const;

/** Auto-reply when customer texts HELP (or INFO). */
export const SMS_HELP_REPLY =
  "Dovetails Services LLC: For help with appointments or service, call (603) 479-1094 or email hello@mydovetails.com. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out. Privacy: https://app.mydovetails.com/privacy";

/** Auto-reply when customer texts STOP (or STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT). */
export const SMS_STOP_REPLY =
  "You have been unsubscribed from Dovetails Services LLC texts. No more messages will be sent. Reply START to re-subscribe. Help: (603) 479-1094";

/** Auto-reply when customer texts START (or UNSTOP, YES) after opt-out. */
export const SMS_START_REPLY =
  "You are re-subscribed to Dovetails Services LLC service texts. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
