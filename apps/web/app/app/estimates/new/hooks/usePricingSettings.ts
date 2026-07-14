"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PRICING_SETTINGS,
  type BusinessPricingSettings,
} from "@ai-fsm/domain";

/**
 * Client-side account pricing rates for live margin / T&M previews.
 * Falls back to DEFAULT_PRICING_SETTINGS until the API responds.
 */
export function usePricingSettings(): {
  settings: BusinessPricingSettings;
  loaded: boolean;
} {
  const [settings, setSettings] = useState<BusinessPricingSettings>(DEFAULT_PRICING_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/pricing/settings");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: BusinessPricingSettings };
        if (!cancelled && json.data) {
          setSettings({
            labor_cost_cents_per_hour: json.data.labor_cost_cents_per_hour,
            labor_billing_cents_per_hour: json.data.labor_billing_cents_per_hour,
            margin_floor_pct: json.data.margin_floor_pct,
            ma_labor_rate_delta: json.data.ma_labor_rate_delta,
            minimum_service_fee_cents: json.data.minimum_service_fee_cents,
            half_day_rate_cents: json.data.half_day_rate_cents,
            full_day_rate_cents: json.data.full_day_rate_cents,
          });
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loaded };
}
