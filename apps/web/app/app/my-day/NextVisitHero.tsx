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
  type HeroVisit,
} from "@/lib/my-day/visit-hero";

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
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function NextVisitHero({ visit }: { visit: HeroVisit }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const mapsUrl = buildMapsUrl(visit.property_address);
  const telUrl = buildTelUrl(visit.client_phone);
  const action = heroPrimaryAction(visit.status);
  const activeOnSite = visit.status === "arrived" || visit.status === "in_progress";
  const kicker = activeOnSite ? "Right now" : "Next visit";
  const primaryLabel =
    action === "start" ? "I'm here" : action === "complete" ? "Complete visit" : null;

  async function handlePrimary() {
    if (!action) return;
    setPending(true);
    const target = action === "start" ? "arrived" : "completed";
    const err = await transitionVisit(visit.id, target);
    setPending(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(action === "start" ? "Arrived on site" : "Visit completed");
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

      {activeOnSite && (
        <div className="p7-field-hero__tools">
          {[
            { label: "Photos", icon: "📸" },
            { label: "Checklist", icon: "✅" },
            { label: "Parts", icon: "🔩" },
            { label: "Notes", icon: "📝" },
          ].map((tool) => (
            <Link
              key={tool.label}
              href={`/app/visits/${visit.id}` as Route}
              className="p7-field-hero__tool"
            >
              <span style={{ fontSize: "var(--text-lg)" }}>{tool.icon}</span>
              {tool.label}
            </Link>
          ))}
        </div>
      )}

      <Link
        href={`/app/visits/${visit.id}` as Route}
        className="p7-field-hero__meta"
        style={{
          display: "block",
          marginTop: "var(--space-1)",
          fontWeight: 600,
          color: "var(--color-forest-100, #dcfce7)",
          textDecoration: "none",
        }}
      >
        Open visit →
      </Link>
    </div>
  );
}
