/**
 * Carrier-required SMS keyword handling (STOP / HELP / START).
 * Matches common CTIA keyword sets; case-insensitive; trims punctuation.
 */

import {
  SMS_HELP_REPLY,
  SMS_START_REPLY,
  SMS_STOP_REPLY,
} from "./consent";

export type SmsKeyword = "stop" | "help" | "start";

const STOP_WORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);

const HELP_WORDS = new Set(["help", "info"]);

const START_WORDS = new Set(["start", "unstop", "yes"]);

function normalizeKeywordBody(message: string): string {
  return message
    .trim()
    .toLowerCase()
    // strip trailing punctuation often added by phones
    .replace(/[.!?,;:]+$/g, "")
    .trim();
}

/**
 * Returns the keyword intent if the entire message is a compliance keyword,
 * otherwise null. Multi-word free text is never treated as STOP/HELP/START.
 */
export function detectSmsKeyword(message: string): SmsKeyword | null {
  const body = normalizeKeywordBody(message);
  if (!body || /\s/.test(body)) return null;
  if (STOP_WORDS.has(body)) return "stop";
  if (HELP_WORDS.has(body)) return "help";
  if (START_WORDS.has(body)) return "start";
  return null;
}

export function replyForSmsKeyword(keyword: SmsKeyword): string {
  switch (keyword) {
    case "stop":
      return SMS_STOP_REPLY;
    case "help":
      return SMS_HELP_REPLY;
    case "start":
      return SMS_START_REPLY;
  }
}
