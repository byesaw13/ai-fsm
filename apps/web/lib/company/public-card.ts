import { z } from "zod";

/**
 * Public business card (TASK-177). The owner edits these in Settings →
 * Company; mydovetails.com reads them at build time from
 * /api/public/business-card for the site contact info, /card, and the saved
 * contact file. Phone and email are the same fields the estimate and invoice
 * letterhead uses, so the two can't drift apart.
 */
export const publicCardSettingsSchema = z.object({
  company_phone: z.string().max(50).optional(),
  company_email: z.string().max(255).optional(),
  card_first_name: z.string().max(80).optional(),
  card_last_name: z.string().max(80).optional(),
  card_nickname: z.string().max(80).optional(),
  card_title: z.string().max(80).optional(),
  card_location: z.string().max(80).optional(),
  card_service_area: z.string().max(120).optional(),
  card_badges: z.array(z.string().max(30)).max(3).optional(),
});

export type PublicCardSettings = z.infer<typeof publicCardSettingsSchema>;

export const PUBLIC_CARD_KEYS = Object.keys(publicCardSettingsSchema.shape) as (keyof PublicCardSettings)[];

// What the site showed before these were editable; empty fields fall back here.
const DEFAULTS = {
  firstName: "Nicolas",
  lastName: "Garon",
  nickname: "Nick",
  title: "Owner",
  phone: "(603) 479-1094",
  email: "hello@mydovetails.com",
  location: "Derry, NH",
  serviceArea: "southern New Hampshire",
  badges: ["Free estimates", "Insured"],
};

export interface PublicCard {
  firstName: string;
  lastName: string;
  nickname: string;
  title: string;
  phoneDisplay: string;
  phoneE164: string;
  email: string;
  location: string;
  serviceArea: string;
  badges: string[];
}

/** US numbers only: "(603) 479-1094" → "+16034791094". Returns null if it isn't one. */
export function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function resolvePublicCard(
  settings: Partial<PublicCardSettings> | null | undefined,
): PublicCard {
  const s = settings ?? {};
  const pick = (v: string | undefined, d: string) => v?.trim() || d;
  // A phone that isn't a dialable US number would break the call and text
  // buttons, so it falls back rather than going out.
  const phoneInput = s.company_phone?.trim();
  const phoneE164 = phoneInput ? toE164(phoneInput) : null;
  const badges = s.card_badges?.map((b) => b.trim()).filter(Boolean);
  return {
    firstName: pick(s.card_first_name, DEFAULTS.firstName),
    lastName: pick(s.card_last_name, DEFAULTS.lastName),
    nickname: pick(s.card_nickname, DEFAULTS.nickname),
    title: pick(s.card_title, DEFAULTS.title),
    phoneDisplay: phoneE164 ? phoneInput! : DEFAULTS.phone,
    phoneE164: phoneE164 ?? toE164(DEFAULTS.phone)!,
    email: pick(s.company_email, DEFAULTS.email),
    location: pick(s.card_location, DEFAULTS.location),
    serviceArea: pick(s.card_service_area, DEFAULTS.serviceArea),
    // An explicitly emptied list means "no badges".
    badges: badges ?? DEFAULTS.badges,
  };
}
