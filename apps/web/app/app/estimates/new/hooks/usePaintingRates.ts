"use client";

import { useEffect, useState } from "react";
import type { PaintingRate } from "@ai-fsm/domain";

/** Painting service codes the room-by-room calculator reads (TASK-193). */
const PAINTING_CODES = new Set(["5012", "5003"]);

/**
 * Production rates and hours-per-day for the room-by-room painting calculator.
 * Empty until the API answers; the calculator then uses its default pace.
 */
export function usePaintingRates(): { rates: PaintingRate[]; hoursPerDay: number | null } {
  const [rates, setRates] = useState<PaintingRate[]>([]);
  const [hoursPerDay, setHoursPerDay] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/production-rates");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { rates: PaintingRate[]; hours_per_day: number } };
        if (cancelled || !json.data) return;
        setRates(json.data.rates.filter((r) => PAINTING_CODES.has(r.service_code)));
        setHoursPerDay(json.data.hours_per_day);
      } catch {
        /* keep the default pace */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { rates, hoursPerDay };
}
