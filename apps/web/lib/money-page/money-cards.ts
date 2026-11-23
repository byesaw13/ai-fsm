import type { MetricCardData } from "@/components/ui";

/**
 * TASK-237: the Money page leads with three answers — what customers owe me,
 * what I spent this month, and this month's claim miles. Pure, so the words
 * and links are tested without a database.
 */
export type MoneyMonth = {
  owedCents: number;
  owedCount: number;
  overdueCents: number;
  spentCents: number;
  spentCount: number;
  claimMiles: number;
  monthLabel: string;
};

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function moneyCards(m: MoneyMonth): MetricCardData[] {
  const owedSub =
    m.owedCount === 0
      ? "Nothing unpaid"
      : `${m.owedCount} unpaid${m.overdueCents > 0 ? ` · ${dollars(m.overdueCents)} overdue` : ""}`;
  const spentSub =
    m.spentCount === 0
      ? `No receipts in ${m.monthLabel}`
      : `${m.spentCount} ${m.spentCount === 1 ? "receipt" : "receipts"} in ${m.monthLabel}`;
  const miles = Number.isInteger(m.claimMiles) ? String(m.claimMiles) : m.claimMiles.toFixed(1);
  return [
    {
      label: "Owed to me",
      value: dollars(m.owedCents),
      sub: owedSub,
      href: "/app/invoices",
      variant: m.overdueCents > 0 ? "alert" : "default",
    },
    { label: "I spent", value: dollars(m.spentCents), sub: spentSub, href: "/app/expenses" },
    { label: "Mileage", value: `${miles} mi`, sub: `claim miles in ${m.monthLabel}`, href: "/app/mileage" },
  ];
}
