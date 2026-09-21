"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { useToast } from "@/components/ui";
import {
  buildMapsUrl,
  buildTelUrl,
  heroPrimaryAction,
  heroPrimaryLabel,
  type HeroVisit,
} from "@/lib/my-day/visit-hero";
import { formatBusinessTime } from "@/lib/time/business-tz";
import { CloseoutWizard } from "@/components/visits/CloseoutWizard";

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

        <div className="p7-field-hero__row">
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
          {telUrl ? (
            <a href={telUrl} className="p7-field-hero__secondary" data-testid="hero-call">
              Call
            </a>
          ) : (
            <button type="button" disabled className="p7-field-hero__secondary" title="No phone on file">
              Call
            </button>
          )}
        </div>
      </div>

      <Link
        href={`/app/visits/${visit.id}` as Route}
        className="p7-field-hero__meta"
        style={{
          display: "block",
          marginTop: "var(--space-1)",
          fontWeight: 600,
          color: "var(--color-forest-100, #fbeee4)",
          textDecoration: "none",
        }}
      >
        Open →
      </Link>
      <CloseoutWizard visitId={visit.id} open={closeoutOpen} onClose={() => setCloseoutOpen(false)} />
    </div>
  );
}
