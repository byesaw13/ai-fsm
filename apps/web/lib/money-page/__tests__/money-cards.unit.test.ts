import { describe, expect, it } from "vitest";
import { moneyCards } from "../money-cards";

describe("Money page cards (TASK-237)", () => {
  it("shows owed, spent and mileage, each linking to its page", () => {
    const cards = moneyCards({
      owedCents: 412_500,
      owedCount: 3,
      overdueCents: 90_000,
      spentCents: 18_734,
      spentCount: 4,
      claimMiles: 212.4,
      monthLabel: "November",
    });
    expect(cards.map((c) => c.label)).toEqual(["Owed to me", "I spent", "Mileage"]);
    expect(cards[0]).toMatchObject({
      value: "$4,125",
      sub: "3 unpaid · $900 overdue",
      href: "/app/invoices",
      variant: "alert",
    });
    expect(cards[1]).toMatchObject({ value: "$187", sub: "4 receipts in November", href: "/app/expenses" });
    expect(cards[2]).toMatchObject({ value: "212.4 mi", sub: "claim miles in November", href: "/app/mileage" });
  });

  it("reads calmly when nothing is owed or spent", () => {
    const cards = moneyCards({
      owedCents: 0,
      owedCount: 0,
      overdueCents: 0,
      spentCents: 0,
      spentCount: 0,
      claimMiles: 0,
      monthLabel: "November",
    });
    expect(cards[0]).toMatchObject({ value: "$0", sub: "Nothing unpaid", variant: "default" });
    expect(cards[1]).toMatchObject({ value: "$0", sub: "No receipts in November" });
    expect(cards[2]).toMatchObject({ value: "0 mi" });
  });

  it("uses the singular for one", () => {
    const cards = moneyCards({
      owedCents: 100,
      owedCount: 1,
      overdueCents: 0,
      spentCents: 500,
      spentCount: 1,
      claimMiles: 1,
      monthLabel: "May",
    });
    expect(cards[0].sub).toBe("1 unpaid");
    expect(cards[1].sub).toBe("1 receipt in May");
  });
});
