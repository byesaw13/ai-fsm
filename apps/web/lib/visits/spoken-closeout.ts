export type CloseoutKind = "done" | "return";
export type CloseoutWhen = "tomorrow" | "date" | "unsure";

export type SpokenCloseoutBody = {
  kind: CloseoutKind;
  today_notes: string;
  send_invoice?: boolean;
  next_when?: CloseoutWhen;
  next_date?: string;
  first_up?: string;
};

/** One spoken sentence is the note. Coming back uses that same sentence as what's first. */
export function spokenCloseoutBody(input: {
  kind: CloseoutKind;
  note: string;
  nextWhen: CloseoutWhen;
  nextDate: string;
  sendBill?: boolean;
  canSend?: boolean;
}): { ok: true; body: SpokenCloseoutBody } | { ok: false; error: string } {
  const today_notes = input.note.trim();
  if (!today_notes) return { ok: false, error: "Say what happened" };
  if (input.kind === "return" && input.nextWhen === "date" && !input.nextDate) {
    return { ok: false, error: "Pick a date" };
  }
  if (input.kind === "done") {
    return {
      ok: true,
      body: {
        kind: "done",
        today_notes,
        send_invoice: Boolean(input.sendBill && input.canSend),
      },
    };
  }
  return {
    ok: true,
    body: {
      kind: "return",
      today_notes,
      first_up: today_notes,
      next_when: input.nextWhen,
      ...(input.nextWhen === "date" ? { next_date: input.nextDate } : {}),
    },
  };
}
