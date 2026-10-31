import path from "path";
import fs from "fs";
import {
  STANDARD_ESTIMATE_TERMS,
  STANDARD_INVOICE_TERMS,
  resolveDepositPolicy,
  renderDepositTerms,
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
  /** The logo is a wide lockup that already carries the company name (TASK-226). */
  logoIsWordmark: boolean;
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

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Wider than this (width ÷ height) and the logo is a name lockup, not a mark. */
const WORDMARK_MIN_ASPECT = 2.5;

/** Reads a PNG's size from its IHDR chunk. JPEGs and unreadable files are not wordmarks. */
export function isWordmarkPng(bytes: Uint8Array): boolean {
  if (bytes.length < 24 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return height > 0 && width / height >= WORDMARK_MIN_ASPECT;
}

function logoFileIsWordmark(logoPath: string | null): boolean {
  if (!logoPath) return false;
  try {
    const fd = fs.openSync(logoPath, "r");
    try {
      const head = Buffer.alloc(24);
      fs.readSync(fd, head, 0, 24, 0);
      return isWordmarkPng(head);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/** Merge account name + settings into a consistent branding object for documents. */
export function resolveCompanyBranding(
  accountName: string,
  settings: CompanyProfileSettings | null | undefined,
  accountId?: string,
): ResolvedCompanyBranding {
  const s = settings ?? {};
  const deposit = resolveDepositPolicy(s);
  const logoPath = accountId ? resolveLogoPath(accountId, s.logo_filename) : null;
  return {
    name: accountName.trim() || "Dovetails Services LLC",
    tagline: s.company_tagline?.trim() || DEFAULT_TAGLINE,
    address: s.company_address?.trim() || null,
    phone: s.company_phone?.trim() || null,
    email: s.company_email?.trim() || null,
    website: s.company_website?.trim() || DEFAULT_WEBSITE,
    // {deposit_percent} is honored inside the terms document too, so the
    // deposit sentence can live there instead of in a separate section.
    invoiceTerms: renderDepositTerms(
      s.invoice_terms?.trim() || STANDARD_INVOICE_TERMS,
      deposit.percent,
    ),
    estimateTerms: renderDepositTerms(
      s.estimate_terms?.trim() || STANDARD_ESTIMATE_TERMS,
      deposit.percent,
    ),
    depositPercent: deposit.percent,
    depositTerms: deposit.terms,
    logoPath,
    logoIsWordmark: logoFileIsWordmark(logoPath),
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