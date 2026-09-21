"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { useToast } from "@/components/ui";
import {
  appendTechNote,
  buildMapsUrl,
  buildTelUrl,
  heroKitchenHref,
  heroKitchenLabel,
  heroPrimaryAction,
  heroPrimaryLabel,
  visitNotesPath,
  type HeroVisit,
} from "@/lib/my-day/visit-hero";
import { formatBusinessTime } from "@/lib/time/business-tz";
import { CloseoutWizard } from "@/components/visits/CloseoutWizard";
import { HeroPhotoButton } from "./HeroPhotoButton";

async function transitionVisit(visitId: string, targetStatus: string): Promise<string | null> {
  const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: targetStatus }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return data.error?.message ?? "Could not update status";
  return null;
}

function formatTime(iso: string): string {
  return formatBusinessTime(iso);
}

export function NextVisitHero({ visit }: { visit: HeroVisit }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [note, setNote] = useState("");
  const [notePending, setNotePending] = useState(false);

  const mapsUrl = buildMapsUrl(visit.property_address);
  const telUrl = buildTelUrl(visit.client_phone);
  const action = heroPrimaryAction(visit.status);
  const activeOnSite = visit.status === "arrived" || visit.status === "in_progress";
  const kicker = activeOnSite ? "Right now" : "Next";
  const primaryLabel = heroPrimaryLabel(visit.status);

  async function handlePrimary() {
    if (!action) return;
    setPending(true);
    if (action === "complete") {
      setPending(false);
      setCloseoutOpen(true);
      return;
    }
    const target = "arrived";
    const err = await transitionVisit(visit.id, target);
    setPending(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success("Job started");
    router.refresh();
  }

  async function handleSaveNote() {
    const addition = note.trim();
    if (!addition) return;
    setNotePending(true);
    try {
      const getRes = await fetch(visitNotesPath(visit.id));
      const getData = await getRes.json().catch(() => ({}));
      if (!getRes.ok) {
        toast.error(getData.error?.message ?? "Could not save note");
        return;
      }
      const existing = (getData.data?.tech_notes as string | null) ?? "";
      const res = await fetch(visitNotesPath(visit.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tech_notes: appendTechNote(existing, addition) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error?.message ?? "Could not save note");
        return;
      }
      setNote("");
      toast.success("Note saved");
      router.refresh();
    } catch {
      toast.error("Could not save note");
    } finally {
      setNotePending(false);
    }
  }

  return (
    <div className="p7-field-hero" data-testid="next-visit-hero">
      <div className="p7-field-hero__kicker">
        {kicker} · {formatTime(visit.scheduled_start)}
      </div>
      <div className="p7-field-hero__title">{visit.job_title ?? "Untitled job"}</div>
      {visit.client_name ? (
        <div className="p7-field-hero__meta">{visit.client_name}</div>
      ) : null}
      {visit.property_address ? (
        <div className="p7-field-hero__meta">{visit.property_address}</div>
      ) : null}
      {visit.first_up ? (
        <div className="p7-field-hero__meta" data-testid="hero-first-up">
          First up: {visit.first_up}
        </div>
      ) : null}

      <div className="p7-field-hero__actions">
        {primaryLabel ? (
          <button
            type="button"
            onClick={handlePrimary}
            disabled={pending}
            data-testid="hero-start-job"
            className="p7-field-hero__primary"
          >
            {pending ? "…" : primaryLabel}
          </button>
        ) : null}

        <div
          className="p7-field-hero__row"
          style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
        >
          <HeroPhotoButton visit={visit} />
          {telUrl ? (
            <a href={telUrl} className="p7-field-hero__secondary" data-testid="hero-call">
              Call
            </a>
          ) : (
            <button type="button" disabled className="p7-field-hero__secondary" title="No phone on file">
              Call
            </button>
          )}
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p7-field-hero__secondary"
              data-testid="hero-navigate"
            >
              Navigate
            </a>
          ) : (
            <button type="button" disabled className="p7-field-hero__secondary" title="No address on file">
              Navigate
            </button>
          )}
        </div>
      </div>

      <div data-testid="hero-note" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <textarea
          data-testid="hero-note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Voice or type a note"
          rows={2}
          disabled={notePending}
          style={{
            width: "100%",
            minHeight: 56,
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-slate-700, #44403c)",
            background: "var(--color-slate-800, #292524)",
            color: "var(--color-slate-100, #f5f5f4)",
            fontSize: "var(--text-sm)",
            resize: "vertical",
          }}
        />
        <button
          type="button"
          data-testid="hero-note-save"
          className="p7-field-hero__secondary"
          disabled={notePending || !note.trim()}
          onClick={() => void handleSaveNote()}
        >
          {notePending ? "…" : "Save note"}
        </button>
      </div>

      <Link
        href={heroKitchenHref(visit.id) as Route}
        data-testid="hero-more"
        className="p7-field-hero__meta"
        style={{
          display: "block",
          marginTop: "var(--space-1)",
          fontWeight: 600,
          color: "var(--color-forest-100, #fbeee4)",
          textDecoration: "none",
        }}
      >
        {heroKitchenLabel()}
      </Link>
      <CloseoutWizard visitId={visit.id} open={closeoutOpen} onClose={() => setCloseoutOpen(false)} />
    </div>
  );
}
