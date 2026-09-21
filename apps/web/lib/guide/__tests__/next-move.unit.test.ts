import { describe, expect, it } from "vitest";
import {
  closeoutHoldSendCopy,
  comingBackStartHereGuide,
  depositVsSpendGuide,
  laneFlipAfterYes,
  nextMove,
  sendVsHoldGuide,
} from "../next-move";

const MBA_WORDS = ["COGS", "AR aging", "AR", "OpEx", "Schedule C", "EBITDA", "accrual"];

function shopEnglish(text: string) {
  for (const word of MBA_WORDS) {
    expect(text).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
  }
}

describe("send vs Hold", () => {
  it("says send now, with one sentence why people pay", () => {
    const guide = sendVsHoldGuide();
    expect(guide.move).toBe("Send now");
    expect(guide.why).toBe("People pay what they still remember.");
    shopEnglish(`${guide.move} ${guide.why}`);
  });

  it("nextMove send_vs_hold is the same English card", () => {
    expect(nextMove("send_vs_hold")).toEqual(sendVsHoldGuide());
  });
});

describe("coming back without start-here", () => {
  it("asks for the first thing Thursday’s person should do", () => {
    const guide = comingBackStartHereGuide();
    expect(guide.move).toBe("Write the first thing Thursday’s person should do.");
    expect(guide.why.length).toBeGreaterThan(10);
    expect(guide.why.endsWith(".")).toBe(true);
    shopEnglish(`${guide.move} ${guide.why}`);
  });

  it("nextMove coming_back_no_start_here is the same English card", () => {
    expect(nextMove("coming_back_no_start_here")).toEqual(comingBackStartHereGuide());
  });
});

describe("deposit vs spend", () => {
  it("says the deposit is materials and yours-after-tax, not spending money", () => {
    const guide = depositVsSpendGuide();
    expect(guide.move).toBe("Don’t spend the deposit.");
    expect(guide.why).toBe("This part is materials. This part is yours after tax.");
    shopEnglish(`${guide.move} ${guide.why}`);
  });

  it("keeps the same warning when amounts are known", () => {
    const guide = depositVsSpendGuide({
      materialsCents: 120_000,
      yoursAfterTaxCents: 80_000,
    });
    expect(guide.move).toBe("Don’t spend the deposit.");
    expect(guide.why).toContain("materials");
    expect(guide.why.toLowerCase()).toContain("yours after tax");
    shopEnglish(`${guide.move} ${guide.why}`);
  });
});

describe("bid vs T&M after yes", () => {
  it("blocks flipping a bid to T&M after they said yes", () => {
    const result = laneFlipAfterYes({
      agreedLane: "flat_rate",
      nextLane: "hourly_internal",
      accepted: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected block");
    expect(result.why.toLowerCase()).toContain("changing the deal");
    shopEnglish(`${result.move} ${result.why}`);
  });

  it("blocks flipping T&M to a bid after they said yes", () => {
    const result = laneFlipAfterYes({
      agreedLane: "hourly_internal",
      nextLane: "flat_rate",
      accepted: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected block");
    expect(result.why.toLowerCase()).toContain("changing the deal");
  });

  it("allows the same lane after yes", () => {
    expect(
      laneFlipAfterYes({
        agreedLane: "flat_rate",
        nextLane: "flat_rate",
        accepted: true,
      }).ok,
    ).toBe(true);
    expect(
      laneFlipAfterYes({
        agreedLane: "hourly_internal",
        nextLane: "hourly_internal",
        accepted: true,
      }).ok,
    ).toBe(true);
  });

  it("does not block a lane change before they said yes", () => {
    expect(
      laneFlipAfterYes({
        agreedLane: "flat_rate",
        nextLane: "hourly_internal",
        accepted: false,
      }).ok,
    ).toBe(true);
  });
});

describe("closeout Hold / Send copy", () => {
  it("uses Send now for an owner who can send", () => {
    const copy = closeoutHoldSendCopy(true);
    expect(copy.sendLabel).toBe("Send now");
    expect(copy.holdLabel.toLowerCase()).toContain("hold");
    expect(copy.why).toBe("People pay what they still remember.");
  });

  it("hides Send when the tech cannot send — owner Send stays explicit", () => {
    const copy = closeoutHoldSendCopy(false);
    expect(copy.sendLabel).toBeNull();
    expect(copy.holdLabel.toLowerCase()).toContain("hold");
    expect(copy.why).toBe("People pay what they still remember.");
  });
});
