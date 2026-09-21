"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Textarea, useToast } from "@/components/ui";

type Kind = "done" | "return";
type NextWhen = "tomorrow" | "date" | "unsure";

export function CloseoutWizard({
  visitId,
  open,
  onClose,
  onBeforeSubmit,
}: {
  visitId: string;
  open: boolean;
  onClose: () => void;
  /** e.g. save completion packet before closeout */
  onBeforeSubmit?: () => Promise<boolean>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<Kind | null>(null);
  const [notes, setNotes] = useState("");
  const [nextWhen, setNextWhen] = useState<NextWhen>("tomorrow");
  const [nextDate, setNextDate] = useState("");
  const [firstUp, setFirstUp] = useState("");
  const [pending, setPending] = useState(false);

  function reset() {
    setKind(null);
    setNotes("");
    setNextWhen("tomorrow");
    setNextDate("");
    setFirstUp("");
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  async function submit(sendBill = false) {
    if (!kind) return;
    const today_notes = notes.trim();
    if (!today_notes) {
      toast.error("What did you do today is required");
      return;
    }
    if (kind === "return" && !firstUp.trim()) {
      toast.error("What’s first when you get here is required");
      return;
    }
    if (kind === "return" && nextWhen === "date" && !nextDate) {
      toast.error("Pick a date");
      return;
    }
    setPending(true);
    try {
      if (onBeforeSubmit) {
        const ok = await onBeforeSubmit();
        if (!ok) return;
      }
      const res = await fetch(`/api/v1/visits/${visitId}/closeout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          today_notes,
          ...(kind === "done" ? { send_invoice: sendBill } : {}),
          ...(kind === "return"
            ? {
                next_when: nextWhen,
                next_date: nextWhen === "date" ? nextDate : undefined,
                first_up: firstUp.trim(),
              }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error?.message ?? "Could not close out");
        return;
      }
      const invoiceId = json.data?.invoice_id as string | undefined;
      reset();
      onClose();
      if (kind === "done" && invoiceId && sendBill) {
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
      toast.error("Could not close out");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Close out this job" data-testid="closeout-wizard">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Done with this job, or coming back?</p>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="button"
            variant={kind === "done" ? "primary" : "secondary"}
            onClick={() => setKind("done")}
            data-testid="closeout-kind-done"
          >
            Done
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
            <label>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>What did you do today?</div>
              <Textarea
                id="closeout-today-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                data-testid="closeout-today-notes"
                placeholder="Voice or type. This becomes the invoice description."
              />
            </label>

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
                <label>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>What’s first when you get here?</div>
                  <Textarea
                    id="closeout-first-up"
                    value={firstUp}
                    onChange={(e) => setFirstUp(e.target.value)}
                    rows={2}
                    data-testid="closeout-first-up"
                    placeholder="Paint the bedroom. Closet doors still in the truck."
                  />
                </label>
              </>
            ) : null}

            {kind === "done" ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  type="button"
                  variant="secondary"
                  loading={pending}
                  onClick={() => void submit(false)}
                  data-testid="closeout-hold"
                >
                  Hold bill
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={pending}
                  onClick={() => void submit(true)}
                  data-testid="closeout-send"
                >
                  Send bill
                </Button>
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
