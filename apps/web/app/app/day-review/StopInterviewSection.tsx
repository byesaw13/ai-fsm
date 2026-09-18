"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STOP_REASON_LABELS,
  stopRequiresNotes,
  type StopReason,
} from "@ai-fsm/domain";
import { Button, Card, SectionHeader, Textarea, useToast } from "@/components/ui";
import { BUSINESS_TIMEZONE } from "@/lib/operations/business-day";
import type { StopInterviewPayload, StopInterviewCard } from "@/lib/day-review/load-stop-interview";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: BUSINESS_TIMEZONE,
  });
}

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function StopInterviewSection({ payload }: { payload: StopInterviewPayload }) {
  const router = useRouter();
  const unanswered = payload.stops.filter((s) => !s.answeredReason);
  const answered = payload.stops.filter((s) => s.answeredReason);

  return (
    <section style={{ marginBottom: "var(--space-6)" }} data-testid="stop-interview">
      <SectionHeader
        title="Today’s stops"
        count={unanswered.length || undefined}
      />
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: "0 0 var(--space-3)" }}>
        GPS already has where you were. Say what each stop was so jobs, receipts, and tomorrow stay true.
      </p>

      {payload.stops.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            No GPS stops today. Start the day on the truck if tracking is off.
          </p>
        </Card>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {unanswered.map((stop) => (
          <StopCard
            key={stop.segmentId}
            stop={stop}
            receipts={payload.receipts}
            jobTargets={payload.jobTargets}
            onSaved={() => router.refresh()}
          />
        ))}
        {answered.map((stop) => (
          <Card key={stop.segmentId} data-testid={`stop-done-${stop.segmentId}`}>
            <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
              {fmtTime(stop.startedAt)}
              {stop.stillThere ? " · still there" : ""}
              {" · "}
              {stop.clientName ? `${stop.clientName} · ` : ""}
              {stop.propertyAddress ?? stop.placeLabel}
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              {STOP_REASON_LABELS[stop.answeredReason!]}
              {stop.answeredNotes ? ` — ${stop.answeredNotes}` : ""}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function StopCard({
  stop,
  receipts,
  jobTargets,
  onSaved,
}: {
  stop: StopInterviewCard;
  receipts: StopInterviewPayload["receipts"];
  jobTargets: StopInterviewPayload["jobTargets"];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<StopReason | null>(stop.suggested);
  const [notes, setNotes] = useState("");
  const [jobTitle, setJobTitle] = useState(
    stop.lastClosedJob ? "" : "",
  );
  const [kind, setKind] = useState<"done" | "return" | null>(null);
  const [nextWhen, setNextWhen] = useState<"tomorrow" | "date" | "unsure">("tomorrow");
  const [nextDate, setNextDate] = useState("");
  const [firstUp, setFirstUp] = useState("");
  const [expenseIds, setExpenseIds] = useState<string[]>([]);
  const [expenseJobId, setExpenseJobId] = useState(jobTargets[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const who = useMemo(() => {
    if (stop.clientName && stop.propertyAddress) {
      return `${stop.clientName} · ${stop.propertyAddress}`;
    }
    return stop.placeLabel;
  }, [stop]);

  async function save() {
    if (!reason) {
      toast.error("What were you there for?");
      return;
    }
    if (stopRequiresNotes(reason) && !notes.trim()) {
      toast.error("What did you do today is required");
      return;
    }
    if (reason === "new_work" && !jobTitle.trim() && !notes.trim()) {
      toast.error("Name the new work");
      return;
    }
    if (stopRequiresNotes(reason) && !kind) {
      toast.error("Done with this job, or coming back?");
      return;
    }
    if (kind === "return" && !firstUp.trim()) {
      toast.error("What’s first when you get here?");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/day-review/stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment_id: stop.segmentId,
          reason,
          notes: notes.trim() || undefined,
          job_title: reason === "new_work" ? (jobTitle.trim() || notes.trim()) : undefined,
          closeout_kind: stopRequiresNotes(reason) ? kind ?? undefined : undefined,
          next_when: kind === "return" ? nextWhen : undefined,
          next_date: kind === "return" && nextWhen === "date" ? nextDate : undefined,
          first_up: kind === "return" ? firstUp.trim() || undefined : undefined,
          expense_ids: reason === "store" ? expenseIds : undefined,
          expense_job_id: reason === "store" && expenseJobId ? expenseJobId : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message ?? "Could not save stop");
      }
      toast.success("Stop saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save stop");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid={`stop-card-${stop.segmentId}`}>
      <div style={{ fontWeight: 600 }}>
        {fmtTime(stop.startedAt)}
        {stop.stillThere ? "–now" : stop.endedAt ? `–${fmtTime(stop.endedAt)}` : ""}
        {" · "}
        {who}
        {stop.stillThere ? " (still there)" : ""}
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginBottom: 8 }}>
        {stop.minutes} min{stop.stillThere ? " so far" : ""}
        {stop.openJob ? ` · open ${stop.openJob.number}` : ""}
        {stop.lastClosedJob
          ? ` · last job ${stop.lastClosedJob.number} is ${stop.lastClosedJob.status}`
          : ""}
      </div>

      <div style={{ fontWeight: 600, marginBottom: 6 }}>What were you there for?</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {stop.options.map((opt) => (
          <Button
            key={opt}
            type="button"
            variant={reason === opt ? "primary" : "secondary"}
            onClick={() => setReason(opt)}
            data-testid={`stop-reason-${opt}`}
          >
            {STOP_REASON_LABELS[opt]}
          </Button>
        ))}
      </div>

      {reason === "new_work" ? (
        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>New job name</div>
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Fridge leak"
            style={{ fontSize: 16, padding: 8, width: "100%", maxWidth: 420 }}
            data-testid="stop-job-title"
          />
        </label>
      ) : null}

      {reason && stopRequiresNotes(reason) ? (
        <>
          <label style={{ display: "block", marginBottom: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>What did you do?</div>
            <Textarea
              id={`stop-notes-${stop.segmentId}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Voice or type. This is the day log."
              data-testid="stop-notes"
            />
          </label>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Done with this job, or coming back?</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Button type="button" variant={kind === "done" ? "primary" : "secondary"} onClick={() => setKind("done")}>
              Done
            </Button>
            <Button type="button" variant={kind === "return" ? "primary" : "secondary"} onClick={() => setKind("return")}>
              Coming back
            </Button>
          </div>
          {kind === "return" ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {(["tomorrow", "date", "unsure"] as const).map((w) => (
                  <Button
                    key={w}
                    type="button"
                    variant={nextWhen === w ? "primary" : "secondary"}
                    onClick={() => setNextWhen(w)}
                  >
                    {w === "tomorrow" ? "Tomorrow" : w === "date" ? "Pick a day" : "Not sure"}
                  </Button>
                ))}
              </div>
              {nextWhen === "date" ? (
                <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} style={{ fontSize: 16, padding: 8 }} />
              ) : null}
              <Textarea
                id={`stop-first-up-${stop.segmentId}`}
                value={firstUp}
                onChange={(e) => setFirstUp(e.target.value)}
                rows={2}
                placeholder="What’s first when you get here?"
              />
            </div>
          ) : null}
        </>
      ) : null}

      {reason === "store" && receipts.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Receipts from today</div>
          {receipts.map((r) => (
            <label key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={expenseIds.includes(r.id)}
                onChange={(e) =>
                  setExpenseIds((ids) =>
                    e.target.checked ? [...ids, r.id] : ids.filter((id) => id !== r.id),
                  )
                }
              />
              {r.vendorName} · {fmtMoney(r.amountCents)}
            </label>
          ))}
          {jobTargets.length > 0 ? (
            <label style={{ display: "block", marginTop: 8, fontSize: 14 }}>
              Put on job
              <select
                value={expenseJobId}
                onChange={(e) => setExpenseJobId(e.target.value)}
                style={{ marginLeft: 8, fontSize: 16, padding: 4 }}
              >
                <option value="">Stock (not a job)</option>
                {jobTargets.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      <Button type="button" onClick={() => void save()} loading={busy} data-testid="stop-save">
        Save this stop
      </Button>
    </Card>
  );
}
