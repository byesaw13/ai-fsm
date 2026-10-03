"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  buildMapsUrl,
  buildTelUrl,
  type HeroVisit,
} from "@/lib/my-day/visit-hero";
import { formatBusinessTime } from "@/lib/time/business-tz";
import {
  fieldPlaceTitle,
  fieldPurpose,
  materialsNeededLine,
  todayCommand,
  todayWhenLabel,
} from "@/lib/field/face";

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

export function NextVisitHero({ visit }: { visit: HeroVisit }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const mapsUrl = buildMapsUrl(visit.property_address);
  const telUrl = buildTelUrl(visit.client_phone);
  const command = todayCommand(visit.status, !!mapsUrl);
  const place = fieldPlaceTitle(visit.client_name, visit.property_address);
  const purpose = fieldPurpose(visit.job_title, "Look");
  const needed = materialsNeededLine(visit.materials_needed);
  const when = `${formatBusinessTime(visit.scheduled_start)} · ${todayWhenLabel(visit.status)}`;

  async function startJob() {
    setPending(true);
    const err = await transitionVisit(visit.id, "arrived");
    setPending(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success("Job started");
    router.push(`/app/visits/${visit.id}` as Route);
    router.refresh();
  }

  const primary = command.verb === "navigate" && mapsUrl ? (
    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="p7-field-hero__primary" data-testid="hero-navigate">
      {command.label}
    </a>
  ) : command.verb === "continue" ? (
    <Link href={`/app/visits/${visit.id}` as Route} className="p7-field-hero__primary" data-testid="hero-continue">
      {command.label}
    </Link>
  ) : (
    <button type="button" className="p7-field-hero__primary" data-testid="hero-start-job" disabled={pending} onClick={() => void startJob()}>
      {pending ? "…" : command.label}
    </button>
  );

  return (
    <>
      <section className="field-command" data-testid="next-visit-hero">
        <p className="field-command__when">{when}</p>
        <h2 className="field-command__place">{place}</h2>
        <p className="field-command__purpose">{purpose}</p>
        {visit.property_address && visit.client_name ? (
          <p className="field-command__where">{visit.property_address}</p>
        ) : null}
        {visit.first_up ? (
          <p className="field-command__next" data-testid="hero-first-up">
            <span>First up</span>
            {visit.first_up}
          </p>
        ) : null}
        {needed ? <p className="field-command__need">{needed}</p> : null}
        <div className="field-command__inline-action">{primary}</div>
        <div className="field-command__quiet">
          {command.verb === "navigate" ? (
            <button type="button" className="field-text-action" data-testid="hero-start-job" disabled={pending} onClick={() => void startJob()}>
              {pending ? "…" : "Start job"}
            </button>
          ) : null}
          <span className="field-command__phone-only">
            {telUrl ? (
              <a href={telUrl} className="field-text-action" data-testid="hero-call">Call</a>
            ) : null}
            {command.verb !== "navigate" && mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="field-text-action" data-testid="hero-navigate">
                Navigate
              </a>
            ) : null}
          </span>
        </div>
      </section>
      <div className="field-command-dock">
        {command.verb === "navigate" && mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="p7-field-hero__primary">
            {place} · {command.label}
          </a>
        ) : command.verb === "continue" ? (
          <Link href={`/app/visits/${visit.id}` as Route} className="p7-field-hero__primary">
            {place} · {command.label}
          </Link>
        ) : (
          <button type="button" className="p7-field-hero__primary" disabled={pending} onClick={() => void startJob()}>
            {pending ? "…" : `${place} · ${command.label}`}
          </button>
        )}
      </div>
    </>
  );
}

/** Same stop, beside the list on a wide screen. Hidden on a phone. */
export function TodayStopRail({ visit }: { visit: HeroVisit }) {
  const mapsUrl = buildMapsUrl(visit.property_address);
  const telUrl = buildTelUrl(visit.client_phone);
  const needed = materialsNeededLine(visit.materials_needed);
  return (
    <aside className="field-today__rail" data-testid="today-stop-rail">
      <p className="field-kicker">This stop</p>
      {visit.first_up ? (
        <p className="field-command__next">
          <span>First up</span>
          {visit.first_up}
        </p>
      ) : (
        <p className="field-command__purpose">{fieldPurpose(visit.job_title, "Look")}</p>
      )}
      {needed ? <p className="field-command__need">{needed}</p> : null}
      <div className="field-command__quiet">
        {telUrl ? (
          <a href={telUrl} className="field-text-action">Call</a>
        ) : null}
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="field-text-action">
            Navigate
          </a>
        ) : null}
      </div>
    </aside>
  );
}
