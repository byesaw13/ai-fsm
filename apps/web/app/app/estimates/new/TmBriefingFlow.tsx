"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { TmDraftReviewPanel } from "./components/TmDraftReviewPanel";
import type { TmEstimateDraft } from "@/lib/estimates/tm-briefing";
import { TM_BRIEFING_STORAGE_KEY } from "@/lib/estimates/job-tm-briefing";

type Phase = "paste" | "loading" | "review";

export interface AppliedTmDraft {
  draft: TmEstimateDraft;
}

interface TmBriefingFlowProps {
  jobId?: string;
  clientId?: string;
  /** Server-loaded job notes / walkthrough dump */
  initialBriefing?: string;
  /** When true and briefing is long enough, generate once on mount */
  autoGenerate?: boolean;
  onApplyDraft: (applied: AppliedTmDraft) => void;
  onSwitchToManual: () => void;
  onSwitchToAi: () => void;
}

const PLACEHOLDER = `Paste notes from a walkthrough, another AI, or your own briefing…

Example:
T&M job in Maynard MA, ~2 days. Ceiling crown, floor molding, trim + cabinet paint, lots of patch and paint. HO has wall paint (age unknown) but no trim paint — bring a quart Advance. Travel extra for Maynard. Expect 16–18 labor hours + 3–4 travel. Materials at cost. Include language that HO paint may need replacement if it doesn't work.`;

function readStoredBriefing(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.sessionStorage.getItem(TM_BRIEFING_STORAGE_KEY);
    if (raw) {
      window.sessionStorage.removeItem(TM_BRIEFING_STORAGE_KEY);
      return raw.trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function TmBriefingFlow({
  jobId,
  clientId,
  initialBriefing = "",
  autoGenerate = false,
  onApplyDraft,
  onSwitchToManual,
  onSwitchToAi,
}: TmBriefingFlowProps) {
  const [briefing, setBriefing] = useState(() => initialBriefing.trim());
  const [phase, setPhase] = useState<Phase>("paste");
  const [draft, setDraft] = useState<TmEstimateDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  async function handleGenerate(text?: string) {
    const body = (text ?? briefing).trim();
    if (body.length < 20) {
      setError("Paste a bit more detail (scope, hours or days, location if known).");
      setPhase("paste");
      return;
    }
    setError(null);
    setPhase("loading");

    try {
      const res = await fetch("/api/v1/estimates/ai-tm-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefing: body,
          ...(jobId ? { job_id: jobId } : {}),
          ...(clientId ? { client_id: clientId } : {}),
        }),
      });

      const json = (await res.json()) as {
        draft?: TmEstimateDraft;
        error?: { message?: string };
      };

      if (!res.ok || !json.draft) {
        setError(json.error?.message ?? "Could not build a T&M draft from this briefing.");
        setPhase("paste");
        return;
      }

      setDraft(json.draft);
      setPhase("review");
    } catch {
      setError("Network error. Please try again.");
      setPhase("paste");
    }
  }

  // Prefill from sessionStorage (job button) and optionally auto-generate once.
  useEffect(() => {
    const stored = readStoredBriefing();
    const text =
      stored.length > briefing.length
        ? stored
        : briefing.trim() || initialBriefing.trim();
    if (stored && stored.length > briefing.length) {
      setBriefing(stored);
    }
    if (!autoGenerate || autoStarted.current) return;
    if (text.length < 20) return;
    autoStarted.current = true;
    void handleGenerate(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "loading") {
    return (
      <div style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)" }}>
        <p style={{ fontSize: "var(--text-lg)", fontWeight: 600, margin: "0 0 var(--space-2)" }}>
          Building T&amp;M estimate…
        </p>
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Extracting hours, travel, materials, and customer language — no price-book codes forced.
        </p>
      </div>
    );
  }

  if (phase === "review" && draft) {
    return (
      <TmDraftReviewPanel
        draft={draft}
        onApply={() => onApplyDraft({ draft })}
        onEdit={() => {
          setPhase("paste");
          setDraft(null);
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <div>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: "var(--text-base)" }}>
            T&amp;M from notes
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            Paste a briefing (including notes from another AI). We price it as time &amp; materials
            using Dovetails rates — not fixed price-book lines.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <button
            type="button"
            onClick={onSwitchToAi}
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Fixed-bid AI →
          </button>
          <button
            type="button"
            onClick={onSwitchToManual}
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Manual →
          </button>
        </div>
      </div>

      <Textarea
        id="tm-briefing-paste"
        value={briefing}
        onChange={(e) => setBriefing(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={14}
        aria-label="T&M briefing notes"
        style={{ fontFamily: "inherit", lineHeight: 1.5 }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          {briefing.trim().length.toLocaleString()} / 20,000 characters
        </span>
        <Button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={briefing.trim().length < 20}
        >
          Generate T&amp;M draft
        </Button>
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--status-error, #dc2626)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
