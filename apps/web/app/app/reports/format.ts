// Presentation helpers shared across the Reports sections.

export function formatCents(cents: number | string): string {
  const n = Number(cents);
  return n < 0
    ? `-$${Math.abs(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pctOf(num: number, den: number): string {
  if (den === 0) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

export function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    materials: "Materials",
    tools: "Tools",
    fuel: "Fuel",
    vehicle: "Vehicle",
    subcontractors: "Subcontractors",
    office: "Office",
    insurance: "Insurance",
    utilities: "Utilities",
    marketing: "Marketing",
    meals: "Meals",
    travel: "Travel",
    other: "Other",
  };
  return labels[cat] ?? cat;
}

export function statusLabel(s: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    sent: "Sent",
    partial: "Partial",
    paid: "Paid",
    overdue: "Overdue",
    void: "Void",
  };
  return labels[s] ?? s;
}

export const OVERRIDE_REASON_LABELS: Record<string, string> = {
  bundled: "Bundled job",
  promo: "Promotional",
  owner_approved: "Owner approved",
};
