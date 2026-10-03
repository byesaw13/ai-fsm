export type DayReviewLeadInput = {
  unansweredStops: number;
  suggestedStops: number;
  answeredStops: number;
  billsOnHold: number;
  leftoverReceipts: number;
  flaggedMiles: boolean;
  openPromises: number;
};

export type DayReviewLead = {
  headline: string;
  needsYou: string[];
  handledSummary: string | null;
};

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** What Day Review should say before the engines. Progress is the unresolved set itself. */
export function dayReviewLead(input: DayReviewLeadInput): DayReviewLead {
  const needsYou: string[] = [];
  const suggested = Math.min(input.suggestedStops, input.unansweredStops);
  const unknown = Math.max(0, input.unansweredStops - suggested);

  if (suggested > 0) {
    needsYou.push(`${countLabel(suggested, "stop looks matched", "stops look matched")} — confirm or change`);
  }
  if (unknown > 0) {
    needsYou.push(`${countLabel(unknown, "stop still needs a reason", "stops still need a reason")}`);
  }
  if (input.billsOnHold > 0) {
    needsYou.push(`${countLabel(input.billsOnHold, "finished job is not billed", "finished jobs are not billed")}`);
  }
  if (input.leftoverReceipts > 0) {
    needsYou.push(`${countLabel(input.leftoverReceipts, "receipt is not on a job", "receipts are not on a job")}`);
  }
  if (input.flaggedMiles) {
    needsYou.push("Mileage needs a look");
  }
  if (input.openPromises > 0) {
    needsYou.push(`${countLabel(input.openPromises, "promise is still open", "promises are still open")}`);
  }

  const handledSummary =
    input.answeredStops > 0
      ? `${countLabel(input.answeredStops, "stop matched already", "stops matched already")}`
      : null;

  return {
    headline:
      needsYou.length === 0
        ? "AI-FSM reconciled this day. Nothing still needs you."
        : "AI-FSM reconciled what it could. These still need you.",
    needsYou,
    handledSummary,
  };
}
