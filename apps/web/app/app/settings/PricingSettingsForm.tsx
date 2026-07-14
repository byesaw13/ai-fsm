"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { DEFAULT_PRICING_SETTINGS, type BusinessPricingSettings } from "@ai-fsm/domain";

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(raw: string): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function PricingSettingsForm() {
  const [settings, setSettings] = useState<BusinessPricingSettings>({ ...DEFAULT_PRICING_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/v1/pricing/settings");
        const json = (await res.json()) as { data?: BusinessPricingSettings; error?: { message?: string } };
        if (!res.ok) {
          setError(json.error?.message ?? "Failed to load pricing settings");
          return;
        }
        if (json.data) {
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
        setError("Network error loading pricing settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/v1/pricing/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = (await res.json()) as { data?: BusinessPricingSettings; error?: { message?: string } };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to save");
        return;
      }
      if (json.data) setSettings(json.data as BusinessPricingSettings);
      setMessage("Labor & pricing rates saved. New estimates and T&M drafts will use these rates.");
    } catch {
      setError("Network error saving pricing settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading labor &amp; pricing settings…</p>;
  }

  const tmMarginPct =
    settings.labor_billing_cents_per_hour > 0
      ? Math.round(
          ((settings.labor_billing_cents_per_hour - settings.labor_cost_cents_per_hour) /
            settings.labor_billing_cents_per_hour) *
            1000
        ) / 10
      : 0;
  const maBill =
    Math.round(settings.labor_billing_cents_per_hour * (1 + settings.ma_labor_rate_delta)) / 100;
  const marginOk = tmMarginPct >= settings.margin_floor_pct * 100;

  return (
    <form onSubmit={(e) => void handleSave(e)} style={{ display: "grid", gap: "var(--space-5)" }}>
      <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)", lineHeight: 1.5 }}>
        These rates drive <strong>T&amp;M estimates</strong>, <strong>margin guardrails</strong>,{" "}
        <strong>invoice labor from tracked time</strong>, and travel when set to standard labor.
        Cost rate is internal only — never shown to customers.
      </p>

      <section style={{ display: "grid", gap: "var(--space-3)" }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700 }}>Hourly rates</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
            <span>Your cost / pay rate ($/hr)</span>
            <Input
              id="labor-cost"
              type="number"
              step="0.01"
              min="0"
              value={centsToDollars(settings.labor_cost_cents_per_hour)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  labor_cost_cents_per_hour: dollarsToCents(e.target.value),
                })
              }
            />
            <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
              Internal cost clock for margin math (e.g. $50.00)
            </span>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
            <span>Customer bill rate — NH ($/hr)</span>
            <Input
              id="labor-bill"
              type="number"
              step="0.01"
              min="0"
              value={centsToDollars(settings.labor_billing_cents_per_hour)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  labor_billing_cents_per_hour: dollarsToCents(e.target.value),
                })
              }
            />
            <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
              What you charge customers for T&amp;M labor
            </span>
          </label>
        </div>
        <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)", maxWidth: 280 }}>
          <span>MA premium (%)</span>
          <Input
            id="ma-delta"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={(settings.ma_labor_rate_delta * 100).toFixed(1)}
            onChange={(e) => {
              const pct = parseFloat(e.target.value);
              setSettings({
                ...settings,
                ma_labor_rate_delta: Number.isFinite(pct) ? Math.max(0, pct) / 100 : 0,
              });
            }}
          />
          <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
            MA bill rate ≈ ${maBill.toFixed(2)}/hr
          </span>
        </label>
      </section>

      <section style={{ display: "grid", gap: "var(--space-3)" }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700 }}>Guardrails</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
            <span>Minimum margin floor (%)</span>
            <Input
              id="margin-floor"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={(settings.margin_floor_pct * 100).toFixed(1)}
              onChange={(e) => {
                const pct = parseFloat(e.target.value);
                setSettings({
                  ...settings,
                  margin_floor_pct: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) / 100 : 0.3,
                });
              }}
            />
            <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
              Estimates below this are blocked from send/create
            </span>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
            <span>Minimum service fee ($)</span>
            <Input
              id="min-fee"
              type="number"
              step="1"
              min="0"
              value={centsToDollars(settings.minimum_service_fee_cents)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  minimum_service_fee_cents: dollarsToCents(e.target.value),
                })
              }
            />
          </label>
        </div>
      </section>

      <section style={{ display: "grid", gap: "var(--space-3)" }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700 }}>Block pricing</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
            <span>Half-day rate ($)</span>
            <Input
              id="half-day"
              type="number"
              step="1"
              min="0"
              value={centsToDollars(settings.half_day_rate_cents)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  half_day_rate_cents: dollarsToCents(e.target.value),
                })
              }
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: "var(--text-sm)" }}>
            <span>Full-day rate ($)</span>
            <Input
              id="full-day"
              type="number"
              step="1"
              min="0"
              value={centsToDollars(settings.full_day_rate_cents)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  full_day_rate_cents: dollarsToCents(e.target.value),
                })
              }
            />
          </label>
        </div>
      </section>

      <div
        style={{
          padding: "var(--space-3)",
          borderRadius: "var(--radius)",
          border: `1px solid ${marginOk ? "var(--status-success, #16a34a)" : "var(--status-error, #dc2626)"}`,
          background: marginOk ? "#f0fdf4" : "#fef2f2",
          fontSize: "var(--text-sm)",
        }}
      >
        <strong>T&amp;M margin check (pure labor):</strong>{" "}
        bill ${centsToDollars(settings.labor_billing_cents_per_hour)}/hr − cost $
        {centsToDollars(settings.labor_cost_cents_per_hour)}/hr ={" "}
        <strong>{tmMarginPct}%</strong> gross
        {marginOk
          ? ` — above your ${(settings.margin_floor_pct * 100).toFixed(0)}% floor ✓`
          : ` — BELOW your ${(settings.margin_floor_pct * 100).toFixed(0)}% floor (T&M estimates will block)`}
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--status-error, #dc2626)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}
      {message && (
        <p style={{ margin: 0, color: "var(--status-success, #16a34a)", fontSize: "var(--text-sm)" }}>
          {message}
        </p>
      )}

      <div>
        <Button type="submit" loading={saving}>
          Save labor &amp; pricing rates
        </Button>
      </div>
    </form>
  );
}
