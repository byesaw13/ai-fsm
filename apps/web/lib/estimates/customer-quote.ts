import { parsePreparedScope } from "@ai-fsm/domain";
import { resolveCompanyBranding, type CompanyProfileSettings } from "@/lib/company/branding";

/** A priced option the customer can ask to add; never part of the quote total (TASK-224). */
interface CustomerAddOn {
  id: string;
  label: string;
  note: string | null;
  price_cents: number | null;
}

/** Options from a prepared scope, for the portal, PDF and print views. */
export function customerAddOns(rawScope: unknown): CustomerAddOn[] {
  const scope = parsePreparedScope(rawScope);
  if (!scope) return [];
  return scope.alternatives.map((a) => ({ id: a.id, label: a.label, note: a.note, price_cents: a.price_cents ?? null }));
}

/** Customers see labor as an amount, not hours times a rate (owner 2026-10-31). */
export function showsQuantityAndRate(lineItemType: string | null | undefined): boolean {
  return lineItemType !== "labor";
}

/**
 * What the customer sees next to the deposit amount (TASK-230): "Deposit to book (30%)".
 * The deposit is what reserves a spot on the schedule.
 */
export function depositLabel(depositType: string | null | undefined, depositPercentage: number | string | null | undefined): string {
  const pct = depositPercentage == null ? NaN : Number(depositPercentage);
  if (depositType === "percentage" && Number.isFinite(pct) && pct > 0) {
    return `Deposit to book (${Math.round(pct * 100) / 100}%)`;
  }
  return "Deposit to book";
}

/**
 * The terms the customer reads on the quote page (TASK-231): the same
 * Settings text the PDF and print copy use, with {deposit_percent} filled in.
 * Deposit terms show only when the quote asks for a deposit.
 */
export function customerQuoteTerms(
  accountName: string,
  settings: CompanyProfileSettings | null | undefined,
  depositCents: number | null | undefined,
): { terms: string; depositTerms: string | null } {
  const b = resolveCompanyBranding(accountName, settings);
  return {
    terms: b.estimateTerms,
    depositTerms: b.depositTerms && (depositCents ?? 0) > 0 ? b.depositTerms : null,
  };
}
