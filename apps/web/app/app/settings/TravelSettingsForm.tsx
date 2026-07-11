"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import type { TravelSettings } from "@ai-fsm/domain";
import { DEFAULT_TRAVEL_SETTINGS } from "@ai-fsm/domain";

interface MileageRateRow {
  id: string;
  rate_cents: number;
  effective_date: string;
  source: string;
  description: string | null;
  is_active: boolean;
}

function centsToDollars(c: number): string {
  return (c / 100).toFixed(2);
}

function dollarsToCents(s: string): number {
  return Math.round(parseFloat(s || "0") * 100);
}

export function TravelSettingsForm() {
  const { success, error } = useToast();
  const [settings, setSettings] = useState<TravelSettings>({ ...DEFAULT_TRAVEL_SETTINGS });
  const [rates, setRates] = useState<MileageRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRate, setNewRate] = useState("0.70");
  const [newRateSource, setNewRateSource] = useState<"irs" | "custom" | "business">("business");
  const [newRateDesc, setNewRateDesc] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [sRes, rRes] = await Promise.all([
          fetch("/api/v1/travel/settings"),
          fetch("/api/v1/travel/rates"),
        ]);
        if (sRes.ok) {
          const j = await sRes.json();
          setSettings(j.data);
        }
        if (rRes.ok) {
          const j = await rRes.json();
          setRates(j.data ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/travel/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error?.message ?? "Save failed");
        return;
      }
      setSettings(data.data);
      success("Travel settings saved");
    } finally {
      setSaving(false);
    }
  }

  async function addRate() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/travel/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rate_cents: dollarsToCents(newRate),
          source: newRateSource,
          description: newRateDesc || null,
          is_active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error?.message ?? "Failed to add rate");
        return;
      }
      setRates((prev) => [data.data, ...prev.map((r) => ({ ...r, is_active: false }))]);
      setSettings((s) => ({ ...s, default_mileage_rate_cents: data.data.rate_cents }));
      success("Mileage rate activated");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--fg-muted)" }}>Loading travel settings…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <form onSubmit={saveSettings} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Business origin</h3>
        <div className="form-group">
          <label htmlFor="origin_address">Street address</label>
          <input
            id="origin_address"
            value={settings.origin_address}
            onChange={(e) => setSettings({ ...settings, origin_address: e.target.value })}
            required
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label htmlFor="origin_city">City</label>
            <input
              id="origin_city"
              value={settings.origin_city}
              onChange={(e) => setSettings({ ...settings, origin_city: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="origin_state">State</label>
            <input
              id="origin_state"
              value={settings.origin_state}
              onChange={(e) => setSettings({ ...settings, origin_state: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="origin_zip">ZIP</label>
            <input
              id="origin_zip"
              value={settings.origin_zip}
              onChange={(e) => setSettings({ ...settings, origin_zip: e.target.value })}
              required
            />
          </div>
        </div>

        <h3 style={{ margin: "16px 0 0", fontSize: 16 }}>Distance policy (one-way miles)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          <Num
            id="included"
            label="Included"
            value={settings.included_one_way_miles}
            onChange={(v) => setSettings({ ...settings, included_one_way_miles: v })}
          />
          <Num
            id="mileage_only"
            label="Mileage-only cutoff"
            value={settings.mileage_only_cutoff_miles}
            onChange={(v) => setSettings({ ...settings, mileage_only_cutoff_miles: v })}
          />
          <Num
            id="travel_time"
            label="Travel-time cutoff"
            value={settings.travel_time_cutoff_miles}
            onChange={(v) => setSettings({ ...settings, travel_time_cutoff_miles: v })}
          />
          <Num
            id="long_distance"
            label="Long-distance review"
            value={settings.long_distance_review_miles}
            onChange={(v) => setSettings({ ...settings, long_distance_review_miles: v })}
          />
        </div>

        <h3 style={{ margin: "16px 0 0", fontSize: 16 }}>Long-distance minimum project value</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label>Low ($)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={centsToDollars(settings.minimum_project_value_low_cents)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  minimum_project_value_low_cents: dollarsToCents(e.target.value),
                })
              }
            />
          </div>
          <div className="form-group">
            <label>High ($)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={centsToDollars(settings.minimum_project_value_high_cents)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  minimum_project_value_high_cents: dollarsToCents(e.target.value),
                })
              }
            />
          </div>
        </div>

        <h3 style={{ margin: "16px 0 0", fontSize: 16 }}>Travel-time rate</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label>Mode</label>
            <select
              value={settings.travel_time_rate_mode}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  travel_time_rate_mode: e.target.value as TravelSettings["travel_time_rate_mode"],
                })
              }
            >
              <option value="standard_labor">Standard labor rate</option>
              <option value="custom">Custom travel rate</option>
              <option value="none">No travel-time charge</option>
            </select>
          </div>
          <div className="form-group">
            <label>Rate ($/hr)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={centsToDollars(settings.default_travel_time_rate_cents)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  default_travel_time_rate_cents: dollarsToCents(e.target.value),
                })
              }
              disabled={settings.travel_time_rate_mode === "none"}
            />
          </div>
          <div className="form-group">
            <label>Rounding</label>
            <select
              value={settings.travel_time_rounding}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  travel_time_rounding: e.target.value as TravelSettings["travel_time_rounding"],
                })
              }
            >
              <option value="exact">Exact minutes</option>
              <option value="nearest_15">Nearest 15 minutes</option>
              <option value="nearest_30">Nearest 30 minutes</option>
            </select>
          </div>
        </div>

        <h3 style={{ margin: "16px 0 0", fontSize: 16 }}>Customer-facing line</h3>
        <div className="form-group">
          <label>Line title</label>
          <input
            value={settings.customer_facing_line_title}
            onChange={(e) =>
              setSettings({ ...settings, customer_facing_line_title: e.target.value })
            }
          />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea
            rows={3}
            value={settings.customer_facing_description}
            onChange={(e) =>
              setSettings({ ...settings, customer_facing_description: e.target.value })
            }
          />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={settings.show_formulas_to_customer}
            onChange={(e) =>
              setSettings({ ...settings, show_formulas_to_customer: e.target.checked })
            }
          />
          Show internal formulas on customer-facing estimates
        </label>

        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save travel policy"}
          </button>
        </div>
      </form>

      <section>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Mileage rates</h3>
        <p style={{ color: "var(--fg-muted)", fontSize: 13, marginTop: 0 }}>
          Historical estimates keep the rate snapshotted at creation. Changing the active rate does
          not alter past invoices.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            type="number"
            min={0}
            step={0.01}
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            style={{ width: 100 }}
            aria-label="New rate dollars per mile"
          />
          <select
            value={newRateSource}
            onChange={(e) => setNewRateSource(e.target.value as "irs" | "custom" | "business")}
          >
            <option value="irs">IRS</option>
            <option value="business">Business</option>
            <option value="custom">Custom</option>
          </select>
          <input
            type="text"
            placeholder="Description"
            value={newRateDesc}
            onChange={(e) => setNewRateDesc(e.target.value)}
            style={{ flex: 1, minWidth: 140 }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void addRate()} disabled={saving}>
            Activate rate
          </button>
        </div>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: 6 }}>Rate</th>
              <th style={{ padding: 6 }}>Effective</th>
              <th style={{ padding: 6 }}>Source</th>
              <th style={{ padding: 6 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: 6, fontFamily: "var(--font-mono)" }}>
                  ${centsToDollars(r.rate_cents)}/mi
                </td>
                <td style={{ padding: 6 }}>{r.effective_date}</td>
                <td style={{ padding: 6 }}>
                  {r.source}
                  {r.description ? ` — ${r.description}` : ""}
                </td>
                <td style={{ padding: 6 }}>{r.is_active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {rates.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 6, color: "var(--fg-muted)" }}>
                  No rates yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Num({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={0}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}
