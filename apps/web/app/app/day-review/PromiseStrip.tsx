"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, SectionHeader, Select, useToast } from "@/components/ui";

type PromiseEntityType = "booking_request" | "estimate" | "job" | "invoice";

type PromiseEntityOption = {
  entityType: PromiseEntityType;
  entityId: string;
  label: string;
  customerName: string;
};

type ReviewCaptureView = {
  id: string;
  excerpt: string;
  proposedTitle: string | null;
  proposedDueAt: string | null;
  suggestedEntityType: PromiseEntityType | null;
  suggestedEntityId: string | null;
  hasAudio: boolean;
  snoozeCount: number;
};

function filterEntities(options: PromiseEntityOption[], query: string): PromiseEntityOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (option) =>
      option.customerName.toLowerCase().includes(q) ||
      option.label.toLowerCase().includes(q),
  );
}

type BusyAction = "confirm" | "correct" | "snooze" | "dismiss" | null;

function entityValue(option: Pick<PromiseEntityOption, "entityType" | "entityId">): string {
  return `${option.entityType}:${option.entityId}`;
}

function parseEntityValue(value: string): { entityType: PromiseEntityOption["entityType"]; entityId: string } | null {
  const [entityType, entityId] = value.split(":");
  if (!entityType || !entityId) return null;
  if (
    entityType !== "booking_request" &&
    entityType !== "estimate" &&
    entityType !== "job" &&
    entityType !== "invoice"
  ) {
    return null;
  }
  return { entityType, entityId };
}

function dueInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export function PromiseStrip({
  captures,
  entities,
}: {
  captures: ReviewCaptureView[];
  entities: PromiseEntityOption[];
}) {
  const toast = useToast();
  const [remaining, setRemaining] = useState(captures);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  const visibleEntities = useMemo(
    () => filterEntities(entities, search),
    [entities, search],
  );

  if (remaining.length === 0) return null;

  async function review(
    capture: ReviewCaptureView,
    action: Exclude<BusyAction, null>,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    setBusyId(capture.id);
    setBusyAction(action);
    try {
      const res = await fetch(`/api/v1/captures/${capture.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error?.message ?? "Could not update this capture");
        return false;
      }
      setRemaining((rows) => rows.filter((row) => row.id !== capture.id));
      if (action === "confirm" || action === "correct") toast.success("Attached to the record");
      if (action === "snooze") toast.info("Snoozed until next review");
      if (action === "dismiss") toast.info("Dismissed — not a commitment");
      return true;
    } catch {
      toast.error("Could not update this capture");
      return false;
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  return (
    <section style={{ marginBottom: "var(--space-6)" }} data-testid="promise-strip">
      <SectionHeader title="Needs you" count={remaining.length} />
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: "0 0 var(--space-3)" }}>
        Captured promises. Confirm onto a job, estimate, invoice, or request. Originals never change.
      </p>
      <Input
        id="promise-customer-search"
        label="Customer search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter by customer name"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {remaining.slice(0, 1).map((capture) => (
          <CaptureCard
            key={capture.id}
            capture={capture}
            entities={visibleEntities}
            allEntities={entities}
            busy={busyId === capture.id}
            busyAction={busyId === capture.id ? busyAction : null}
            onReview={review}
          />
        ))}
      </div>
    </section>
  );
}

function CaptureCard({
  capture,
  entities,
  allEntities,
  busy,
  busyAction,
  onReview,
}: {
  capture: ReviewCaptureView;
  entities: PromiseEntityOption[];
  allEntities: PromiseEntityOption[];
  busy: boolean;
  busyAction: BusyAction;
  onReview: (
    capture: ReviewCaptureView,
    action: Exclude<BusyAction, null>,
    body: Record<string, unknown>,
  ) => Promise<boolean>;
}) {
  const suggestedValue =
    capture.suggestedEntityType && capture.suggestedEntityId
      ? entityValue({
          entityType: capture.suggestedEntityType,
          entityId: capture.suggestedEntityId,
        })
      : "";
  const suggestedInList = allEntities.some((option) => entityValue(option) === suggestedValue);

  const [selected, setSelected] = useState(suggestedInList ? suggestedValue : "");
  const [correcting, setCorrecting] = useState(!capture.proposedTitle);
  const [title, setTitle] = useState(capture.proposedTitle ?? "");
  const [due, setDue] = useState(dueInputValue(capture.proposedDueAt));

  const options = entities.map((option) => ({
    value: entityValue(option),
    label: option.label,
  }));
  if (suggestedValue && !options.some((option) => option.value === suggestedValue)) {
    options.unshift({
      value: suggestedValue,
      label: `Suggested ${capture.suggestedEntityType}`,
    });
  }

  const entity = parseEntityValue(selected);
  const canAttach = Boolean(entity) && allEntities.length + (suggestedValue ? 1 : 0) > 0;
  const canConfirm = canAttach && Boolean(capture.proposedTitle);
  const canCorrect = canAttach && title.trim().length > 0;
  const canSnooze = capture.snoozeCount === 0;

  return (
    <Card data-testid={`promise-card-${capture.id}`}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--text-sm)" }}>
        {capture.proposedTitle ?? "Listen and decide"}
      </p>
      <p style={{ margin: "var(--space-2) 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
        {capture.excerpt || "No transcript yet."}
      </p>
      {capture.hasAudio ? (
        <audio
          controls
          preload="metadata"
          src={`/api/v1/captures/${capture.id}/audio`}
          style={{ width: "100%", marginBottom: "var(--space-3)" }}
        >
          Playback not supported
        </audio>
      ) : null}
      {capture.suggestedEntityType && capture.suggestedEntityId ? (
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Suggested: {capture.suggestedEntityType}
          {suggestedInList
            ? ` — ${allEntities.find((option) => entityValue(option) === suggestedValue)?.label ?? ""}`
            : ""}
        </p>
      ) : (
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          No suggested record. Pick one to confirm.
        </p>
      )}

      <Select
        id={`promise-entity-${capture.id}`}
        label="Attach to"
        required
        placeholder={allEntities.length === 0 ? "No supported entity" : "Select a record"}
        options={options}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      />
      {allEntities.length === 0 && !suggestedValue ? (
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          No job, estimate, invoice, or request to attach. Cannot confirm.
        </p>
      ) : null}

      {correcting ? (
        <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <Input
            id={`promise-title-${capture.id}`}
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            id={`promise-due-${capture.id}`}
            label="Due"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Button
          onClick={() =>
            entity &&
            onReview(capture, "confirm", {
              action: "confirm",
              entity_type: entity.entityType,
              entity_id: entity.entityId,
            })
          }
          loading={busy && busyAction === "confirm"}
          disabled={busy || !canConfirm || correcting}
        >
          Confirm and attach
        </Button>
        {correcting ? (
          <Button
            onClick={() =>
              entity &&
              onReview(capture, "correct", {
                action: "correct",
                entity_type: entity.entityType,
                entity_id: entity.entityId,
                title: title.trim(),
                due_at: due || null,
              })
            }
            loading={busy && busyAction === "correct"}
            disabled={busy || !canCorrect}
          >
            Attach correction
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => setCorrecting(true)}
            disabled={busy}
          >
            Correct, then attach
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => onReview(capture, "snooze", { action: "snooze" })}
          loading={busy && busyAction === "snooze"}
          disabled={busy || !canSnooze}
        >
          {canSnooze ? "Snooze once" : "Already snoozed"}
        </Button>
        <Button
          variant="danger"
          onClick={() => onReview(capture, "dismiss", { action: "dismiss" })}
          loading={busy && busyAction === "dismiss"}
          disabled={busy}
        >
          Not a commitment
        </Button>
      </div>
    </Card>
  );
}
