import { normalizePhone } from "@/lib/phone";

/** Service texts go only to someone who consented and asked to be texted. */
export function serviceSmsPhone(row: {
  sms_consent?: boolean | null;
  preferred_contact?: string | null;
  phone?: string | null;
}): string | null {
  if (row.sms_consent !== true) return null;
  if (row.preferred_contact !== "sms") return null;
  return normalizePhone(row.phone ?? "") ?? null;
}

export function withStop(body: string): string {
  const text = body.trim();
  if (/reply stop/i.test(text)) return text;
  return `${text} Reply STOP to opt out.`;
}

export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function firstWord(full: string | null | undefined): string | null {
  const word = full?.trim().split(/\s+/)[0];
  return word || null;
}

export function quoteReadyText(ref: string, url: string): string {
  return withStop(`Dovetails: your quote ${ref} is ready. ${url}`);
}

export function invoiceReadyText(opts: {
  number: string;
  amountDueCents: number;
  url: string;
  paid: boolean;
}): string {
  if (opts.paid) {
    return withStop(`Dovetails: receipt for invoice ${opts.number}. ${opts.url}`);
  }
  return withStop(
    `Dovetails: invoice ${opts.number} is ready. Amount due ${money(opts.amountDueCents)}. ${opts.url}`
  );
}

export function onTheWayText(opts: {
  techName: string | null;
  title: string;
  address: string | null;
}): string {
  const tech = firstWord(opts.techName);
  const who = tech ? `${tech} is` : "We are";
  const where = opts.address?.trim() ? ` at ${opts.address.trim()}` : "";
  return withStop(`Dovetails: ${who} on the way for ${opts.title}${where}.`);
}

export function appointmentWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

/** Whole message is YES or Y. Free text such as "yes that works" is not. */
export function isBareYes(message: string): boolean {
  const body = message
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, "")
    .trim();
  return body === "yes" || body === "y";
}

export function confirmReply(title: string, whenLabel: string): string {
  return withStop(`Dovetails: you're confirmed for ${title} on ${whenLabel}.`);
}

export function nothingToConfirmReply(): string {
  return withStop("Dovetails: nothing upcoming to confirm. Call or text us if you need to.");
}
