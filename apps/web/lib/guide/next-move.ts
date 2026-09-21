/** One English next move + one sentence why. No MBA words. */

export type GuideMove = {
  move: string;
  why: string;
};

export type PricingLane = "flat_rate" | "hourly_internal";

export type NextMoveKind =
  | "send_vs_hold"
  | "coming_back_no_start_here"
  | "deposit_vs_spend"
  | "lane_flip";

export type LaneFlipResult =
  | { ok: true }
  | { ok: false; move: string; why: string };

export function sendVsHoldGuide(): GuideMove {
  return {
    move: "Send now",
    why: "People pay what they still remember.",
  };
}

export function comingBackStartHereGuide(): GuideMove {
  return {
    move: "Write the first thing Thursday’s person should do.",
    why: "If it isn’t on the house, Thursday starts from scratch.",
  };
}

export function depositVsSpendGuide(_input?: {
  materialsCents?: number;
  yoursAfterTaxCents?: number;
}): GuideMove {
  return {
    move: "Don’t spend the deposit.",
    why: "This part is materials. This part is yours after tax.",
  };
}

export function laneFlipAfterYes(input: {
  agreedLane: PricingLane;
  nextLane: PricingLane;
  accepted: boolean;
}): LaneFlipResult {
  if (!input.accepted || input.agreedLane === input.nextLane) {
    return { ok: true };
  }
  if (input.agreedLane === "flat_rate") {
    return {
      ok: false,
      move: "Keep the bid.",
      why: "If you change it to T&M after they said yes, you are changing the deal.",
    };
  }
  return {
    ok: false,
    move: "Keep T&M.",
    why: "If you switch to a bid after they said yes, you are changing the deal.",
  };
}

export function nextMove(kind: NextMoveKind): GuideMove {
  switch (kind) {
    case "send_vs_hold":
      return sendVsHoldGuide();
    case "coming_back_no_start_here":
      return comingBackStartHereGuide();
    case "deposit_vs_spend":
      return depositVsSpendGuide();
    case "lane_flip":
      return {
        move: "Keep the bid.",
        why: "If you change it to T&M after they said yes, you are changing the deal.",
      };
  }
}

/** Closeout Hold / Send labels. Tech cannot Send — owner Send stays explicit. */
export function closeoutHoldSendCopy(canSend: boolean): {
  holdLabel: string;
  sendLabel: string | null;
  why: string;
} {
  const guide = sendVsHoldGuide();
  return {
    holdLabel: "Hold bill",
    sendLabel: canSend ? guide.move : null,
    why: guide.why,
  };
}
