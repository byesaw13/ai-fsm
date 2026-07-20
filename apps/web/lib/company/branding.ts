import path from "path";
import fs from "fs";
import {
  STANDARD_ESTIMATE_NOTES,
  STANDARD_INVOICE_TERMS,
  resolveDepositPolicy,
} from "@ai-fsm/domain";

/** Company profile fields stored in accounts.settings JSONB. */
export interface CompanyProfileSettings {
  company_tagline?: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  company_website?: string;
  invoice_terms?: string;
  estimate_terms?: string;
  /** Standard deposit percentage for the business (0–100). */
  deposit_percent?: number;
  /** Deposits wording; may contain {deposit_percent}. */
  deposit_terms?: string;
  logo_filename?: string;
}

export interface ResolvedCompanyBranding {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  invoiceTerms: string;
  estimateTerms: string;
  /** Standard deposit percentage for the business. */
  depositPercent: number;
  /** Deposits wording with the standard percentage already substituted. */
  depositTerms: string;
  /** Absolute path on disk when logo exists, else null. */
  logoPath: string | null;
}

const DEFAULT_WEBSITE = "mydovetails.com";
const DEFAULT_TAGLINE = "Fully Insured";

export function accountLogoDir(accountId: string): string {
  return path.join("/app/uploads/account", accountId);
}

export function resolveLogoPath(accountId: string, filename: string | undefined): string | null {
  if (!filename) return null;
  const safe = path.basename(filename);
  if (safe !== filename || !/^[a-zA-Z0-9._-]+$/.test(safe)) return null;
  const full = path.join(accountLogoDir(accountId), safe);
  try {
    if (fs.existsSync(full)) return full;
  } catch {
    /* disk unavailable in some test envs */
  }
  return null;
}

/** Merge account name + settings into a consistent branding object for documents. */
export function resolveCompanyBranding(
  accountName: string,
  settings: CompanyProfileSettings | null | undefined,
  accountId?: string,
): ResolvedCompanyBranding {
  const s = settings ?? {};
  const deposit = resolveDepositPolicy(s);
  return {
    name: accountName.trim() || "Dovetails Services LLC",
    tagline: s.company_tagline?.trim() || DEFAULT_TAGLINE,
    address: s.company_address?.trim() || null,
    phone: s.company_phone?.trim() || null,
    email: s.company_email?.trim() || null,
    website: s.company_website?.trim() || DEFAULT_WEBSITE,
    invoiceTerms: s.invoice_terms?.trim() || STANDARD_INVOICE_TERMS,
    estimateTerms: s.estimate_terms?.trim() || STANDARD_ESTIMATE_NOTES,
    depositPercent: deposit.percent,
    depositTerms: deposit.terms,
    logoPath: accountId ? resolveLogoPath(accountId, s.logo_filename) : null,
  };
}

/** Contact lines for letterhead (address, phone, email, website). */
export function brandingContactLines(b: ResolvedCompanyBranding): string[] {
  const lines: string[] = [];
  if (b.address) {
    lines.push(...b.address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  }
  if (b.phone) lines.push(b.phone);
  if (b.email) lines.push(b.email);
  if (b.website) lines.push(b.website);
  return lines;
}