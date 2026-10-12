"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Textarea, useToast } from "@/components/ui";
import { closeoutHoldSendCopy, comingBackStartHereGuide } from "@/lib/guide/next-move";
import { browserSpeechAvailable, startBrowserSpeech } from "@/app/app/capture/speech-transcript";
import { spokenCloseoutBody } from "@/lib/visits/spoken-closeout";

import { useFieldDraft } from "@/components/features/field/useFieldDraft";

type Kind = "done" | "return";
type NextWhen = "tomorrow" | "date" | "unsure";

function SpokenNote({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [listening, setListening] = useState(false);
  const [canSpeak] = useState(() => browserSpeechAvailable());
  const [stop, setStop] = useState<null | (() => Promise<{ text: string; error: string }>)>(null);

  async function toggle() {
    if (!listening) {
      setListening(true);
      setStop(() => startBrowserSpeech(onChange));
      return;
    }
    setListening(false);
    const result = await stop?.();
    setStop(null);
    if (result?.text) onChange(result.text);
  }

  const prompt = "Say what happened. Those words are the note.";
  if (!canSpeak) {
    return (
      <label>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{prompt}</div>
        <Textarea
          id="closeout-today-notes"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          data-testid="closeout-today-notes"
        />
      </label>
    );
  }
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{prompt}</div>
      <Button type="button" variant={listening ? "primary" : "secondary"} onClick={() => void toggle()} data-testid="closeout-speak">
        {listening ? "Stop" : value ? "Say it again" : "Say it"}
      </Button>
      <p data-testid="closeout-spoken" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
        {value || "The words show up here."}
      </p>
    </div>
  );
}

export function CloseoutWizard({
  visitId,
  open,
  onClose,
  onBeforeSubmit,
  canSend = false,
  draftKey,
  initialNotes = "",
}: {
  visitId: string;
  draftKey?: string;
  initialNotes?: string;
  open: boolean;
  onClose: () => void;
  /** e.g. save completion packet before closeout */
  onBeforeSubmit?: () => Promise<boolean>;
  /** Owner/admin Send. Tech files; owner Send stays explicit. Default off. */
  canSend?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind, clearKind] = useFieldDraft<Kind | null>(draftKey ? `${draftKey}:kind` : undefined, null);
  const [notes, setNotes, clearNotes, conflictingNotes] = useFieldDraft<string>(draftKey ? `${draftKey}:notes` : undefined, initialNotes);
  const [nextWhen, setNextWhen, clearNextWhen] = useFieldDraft<NextWhen>(draftKey ? `${draftKey}:nextWhen` : undefined, "tomorrow");
  const [nextDate, setNextDate, clearNextDate] = useFieldDraft<string>(draftKey ? `${draftKey}:nextDate` : undefined, "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function reset() {
    setKind(null);
    setNotes("");
    setNextWhen("tomorrow");
    setNextDate("");
  }

  function handleClose() {
    if (pending) return;
    onClose();
  }

  const holdSend = closeoutHoldSendCopy(canSend);
  const returnGuide = comingBackStartHereGuide();

  async function submit(sendBill = false) {
    if (!kind) return;
    const spoken = spokenCloseoutBody({
      kind,
      note: notes,
      nextWhen,
      nextDate,
      sendBill,
      canSend,
    });
    if (!spoken.ok) {
      toast.error(spoken.error);
      return;
    }
    if (pending) return;
    setError("");
    setPending(true);
    try {
      if (onBeforeSubmit) {
        const ok = await onBeforeSubmit();
        if (!ok) return;
      }
      const res = await fetch(`/api/v1/visits/${visitId}/closeout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spoken.body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error?.message ?? "Could not close out. Your draft is kept; retry.");
        return;
      }
      const invoiceId = json.data?.invoice_id as string | undefined;
      reset();
      clearKind(); clearNotes(); clearNextWhen(); clearNextDate();
      onClose();
      if (kind === "done" && invoiceId && sendBill && canSend) {
        const sent = await fetch(`/api/v1/invoices/${invoiceId}/send`, { method: "POST" });
        if (sent.ok) {
          toast.success("Bill sent");
        } else {
          toast.success("Draft ready — send from the bill");
          router.push(`/app/invoices/${invoiceId}?deliver=1` as never);
          return;
        }
      } else if (kind === "done" && invoiceId) {
        toast.success("Bill held as draft");
      } else {
        toast.success(kind === "done" ? "Job closed" : "Day logged — coming back");
      }
      router.refresh();
    } catch {
      setError("Could not close out. Your draft is kept; retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Finish this visit" data-testid="closeout-wizard">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <p role="alert" className="p7-field-error">{error}</p>}
        <p style={{ margin: 0, fontWeight: 600 }}>Done with this job, or coming back?</p>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="button"
            variant={kind === "done" ? "primary" : "secondary"}
            onClick={() => setKind("done")}
            data-testid="closeout-kind-done"
          >
            Whole job done
          </Button>
          <Button
            type="button"
            variant={kind === "return" ? "primary" : "secondary"}
            onClick={() => setKind("return")}
            data-testid="closeout-kind-return"
          >
            Coming back
          </Button>
        </div>

        {kind ? (
          <>
            {conflictingNotes !== undefined ? <div role="status">
              <p>Saved visit notes changed. Your earlier closeout draft is kept here:</p>
              <p style={{ whiteSpace: "pre-wrap" }}>{conflictingNotes}</p>
              <Button type="button" variant="secondary" onClick={() => setNotes(conflictingNotes)}>Restore my draft</Button>
            </div> : null}
            <SpokenNote value={notes} onChange={setNotes} />

            {kind === "return" ? (
              <>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>When are you back?</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(["tomorrow", "date", "unsure"] as const).map((w) => (
                      <Button
                        key={w}
                        type="button"
                        variant={nextWhen === w ? "primary" : "secondary"}
                        onClick={() => setNextWhen(w)}
                        data-testid={`closeout-next-${w}`}
                      >
                        {w === "tomorrow" ? "Tomorrow" : w === "date" ? "Pick a day" : "Not sure"}
                      </Button>
                    ))}
                  </div>
                  {nextWhen === "date" ? (
                    <input
                      type="date"
                      value={nextDate}
                      onChange={(e) => setNextDate(e.target.value)}
                      data-testid="closeout-next-date"
                      style={{ marginTop: 8, fontSize: 16, padding: 8 }}
                    />
                  ) : null}
                </div>
                <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 14 }}>
                  {returnGuide.move} {returnGuide.why}
                </p>
              </>
            ) : null}

            {kind === "done" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 14 }} data-testid="closeout-send-why">
                  {holdSend.sendLabel ? `${holdSend.sendLabel}. ${holdSend.why}` : holdSend.why}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={pending}
                    onClick={() => void submit(false)}
                    data-testid="closeout-hold"
                  >
                    {holdSend.holdLabel}
                  </Button>
                  {holdSend.sendLabel ? (
                    <Button
                      type="button"
                      variant="primary"
                      loading={pending}
                      onClick={() => void submit(true)}
                      data-testid="closeout-send"
                    >
                      {holdSend.sendLabel}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="primary"
                loading={pending}
                onClick={() => void submit(false)}
                data-testid="closeout-submit"
              >
                Save and come back
              </Button>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
