"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACTIVITY_TYPE_META,
  formatHours,
  type ActivityType,
  type DayDraft,
  type DayDraftItem,
} from "@ai-fsm/domain";
import { Button, Card, SectionHeader, useToast } from "@/components/ui";
import { BUSINESS_TIMEZONE } from "@/lib/operations/business-day";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: BUSINESS_TIMEZONE,
  });
}

function activityMeta(type: ActivityType | null) {
  if (!type) return { emoji: "•", label: "Unlabeled" };
  return ACTIVITY_TYPE_META[type];
}

async function confirmItem(item: DayDraftItem): Promise<{ ok: true } | { ok: false; message: string }> {
  if (item.candidateId && item.proposedClassification) {
    const res = await fetch(`/api/v1/visit-candidates/${item.candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "confirm",
        classification: item.proposedClassification,
        work_order_id: item.workOrderId || undefined,
        switch_activity: false,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, message: body.error?.message ?? "Could not confirm visit" };
    }
    return { ok: true };
  }

  if (!item.segmentId || !item.proposedActivity) {
    return { ok: false, message: "Nothing to confirm" };
  }

  const body =
    item.kind === "drive"
      ? {
          action: "confirm_trip",
          vehicle_id: item.vehicleId,
          miles: item.estimatedMiles,
          activity_type: item.proposedActivity,
        }
      : {
          action: "confirm",
          activity_type: item.proposedActivity,
          ...(item.visitId
            ? { entity_type: "visit", entity_id: item.visitId }
            : item.jobId
              ? { entity_type: "job", entity_id: item.jobId }
              : item.clientId
                ? { entity_type: "client", entity_id: item.clientId }
                : {}),
        };

  const res = await fetch(`/api/v1/activities/segments/${item.segmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return { ok: false, message: json.error?.message ?? "Could not confirm segment" };
  }
  return { ok: true };
}

export function DayDraftSection({ date, draft }: { date: string; draft: DayDraft }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<string | null>(null);
  const [narrating, setNarrating] = useState(false);

  const visible = useMemo(
    () => draft.items.filter((i) => !done.has(i.key)),
    [draft.items, done],
  );
  const ready = visible.filter((i) => i.ready);
  const exceptions = visible.filter((i) => i.exception && !i.alreadyLogged);
  const logged = visible.filter((i) => i.alreadyLogged);

  async function acceptReady() {
    if (ready.length === 0) return;
    setBusy(true);
    try {
      const accepted: string[] = [];
      for (const item of ready) {
        const result = await confirmItem(item);
        if (!result.ok) {
          toast.error(result.message);
          break;
        }
        accepted.push(item.key);
      }
      if (accepted.length > 0) {
        setDone((s) => new Set([...s, ...accepted]));
        toast.success(
          accepted.length === ready.length
            ? `Logged ${accepted.length} item${accepted.length === 1 ? "" : "s"}`
            : `Logged ${accepted.length} of ${ready.length} — stopped on an error`,
        );
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function narrate() {
    setNarrating(true);
    try {
      const res = await fetch(`/api/v1/day-review/${date}/draft?narrate=1`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Could not write a summary");
      setSummary(json.data?.summary ?? draft.reconciliation);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not write a summary");
    } finally {
      setNarrating(false);
    }
  }

  return (
    <section style={{ marginBottom: "var(--space-6)" }} data-testid="day-draft">
      <SectionHeader title="Day draft" count={ready.length || undefined} />
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: "0 0 var(--space-3)" }}>
        GPS, schedule, and receipts compared to the ledger. Accept the ready items; exceptions stay for you.
      </p>

      <Card>
        <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>{summary ?? draft.reconciliation}</p>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
          <Button onClick={acceptReady} loading={busy} disabled={ready.length === 0}>
            {ready.length === 0 ? "Nothing ready" : `Accept ${ready.length} ready item${ready.length === 1 ? "" : "s"}`}
          </Button>
          <Button variant="ghost" onClick={narrate} loading={narrating} disabled={narrating}>
            Write a summary
          </Button>
        </div>
      </Card>

      {ready.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
          {ready.map((item) => (
            <DraftRow key={item.key} item={item} tone="ready" />
          ))}
        </div>
      ) : null}

      {exceptions.length > 0 ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, margin: "0 0 var(--space-2)" }}>
            Needs you ({exceptions.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {exceptions.map((item) => (
              <DraftRow key={item.key} item={item} tone="exception" />
            ))}
          </div>
        </div>
      ) : null}

      {logged.length > 0 ? (
        <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {logged.length} already on the ledger · attributed {formatHours(draft.attributedMinutes)}
        </p>
      ) : null}
    </section>
  );
}

function DraftRow({ item, tone }: { item: DayDraftItem; tone: "ready" | "exception" }) {
  const meta = activityMeta(item.proposedActivity);
  return (
    <div
      data-testid={`day-draft-${tone}-${item.key}`}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        borderRadius: "var(--radius-md)",
        border: tone === "exception" ? "1px dashed var(--border)" : "1px solid var(--border)",
        background: "var(--bg-subtle)",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
          {meta.emoji} {item.label}
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {fmtTime(item.startedAt)} – {fmtTime(item.endedAt)} · {formatHours(item.minutes)}
          {item.proposedActivity ? ` · ${meta.label}` : ""}
          {item.estimatedMiles != null ? ` · ${item.estimatedMiles} mi` : ""}
        </div>
        {item.reasons.length > 0 ? (
          <div style={{ fontSize: "0.8rem", color: "var(--fg-muted)", marginTop: 2 }}>
            {item.reasons.join(" · ")}
          </div>
        ) : null}
      </div>
      {item.exception ? (
        <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
          {item.exception}
        </span>
      ) : (
        <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
          {item.confidence}
        </span>
      )}
    </div>
  );
}
