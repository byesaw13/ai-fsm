/** Service texts: consented customers who asked to be texted. Phones in the DB are E.164. */

export type Textable = {
  client_phone?: string | null;
  sms_consent?: boolean | null;
  preferred_contact?: string | null;
};

export function serviceTextPhone(row: Textable): string | null {
  if (row.sms_consent !== true) return null;
  if (row.preferred_contact !== "sms") return null;
  const raw = (row.client_phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function noticeTarget(
  row: Textable,
  email: string | null
): { channel: "sms"; to: string } | { channel: "email"; to: string } | null {
  const phone = serviceTextPhone(row);
  if (phone) return { channel: "sms", to: phone };
  if (email) return { channel: "email", to: email };
  return null;
}

function withStop(body: string): string {
  const text = body.trim();
  return /reply stop/i.test(text) ? text : `${text} Reply STOP to opt out.`;
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

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function visitReminderText(title: string, whenLabel: string, address: string | null): string {
  const where = address?.trim() ? ` at ${address.trim()}` : "";
  return withStop(`Dovetails: ${title} is scheduled ${whenLabel}${where}. Reply YES to confirm.`);
}

export function bookingConfirmedText(title: string, whenLabel: string, address: string | null): string {
  const where = address?.trim() ? ` at ${address.trim()}` : "";
  return withStop(`Dovetails: ${title} is booked for ${whenLabel}${where}.`);
}

export function quoteFollowupText(amountCents: number, url: string | null): string {
  const link = url ? ` ${url}` : "";
  return withStop(`Dovetails: your quote (${money(amountCents)}) is still open.${link}`);
}

export function billFollowupText(number: string, amountDueCents: number, url: string | null): string {
  const link = url ? ` ${url}` : "";
  return withStop(`Dovetails: invoice ${number} is due. Amount due ${money(amountDueCents)}.${link}`);
}

export function reviewRequestText(title: string): string {
  return withStop(`Dovetails: how did ${title} go? A short reply helps.`);
}
