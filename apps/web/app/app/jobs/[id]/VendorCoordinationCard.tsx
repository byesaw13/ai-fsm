"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  VENDOR_COORDINATION_MODES,
  VENDOR_COORDINATION_LABELS,
  VENDOR_COORDINATION_DESCRIPTIONS,
  CONCIERGE_DEFAULT_FEE_CENTS,
} from "@ai-fsm/domain";
import type { VendorCoordinationMode } from "@ai-fsm/domain";

interface Props {
  jobId: string;
  vendorCoordination: VendorCoordinationMode | null;
  conciergeFeeCents: number | null;
  canEdit: boolean;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function VendorCoordinationCard({ jobId, vendorCoordination, conciergeFeeCents, canEdit }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<VendorCoordinationMode | "">(vendorCoordination ?? "");
  const [feeDollars, setFeeDollars] = useState(
    conciergeFeeCents != null ? (conciergeFeeCents / 100).toFixed(2) : (CONCIERGE_DEFAULT_FEE_CENTS / 100).toFixed(2)
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        vendor_coordination: mode || null,
        concierge_fee_cents: mode === "concierge" ? Math.round(parseFloat(feeDollars) * 100) : null,
      };
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to save");
        return;
      }
      setEditing(false);
      router.refresh();
      toast.success("Vendor coordination updated");
    } catch {
      toast.error("Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_coordination: null, concierge_fee_cents: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to clear");
        return;
      }
      setMode("");
      setEditing(false);
      router.refresh();
      toast.success("Vendor coordination cleared");
    } catch {
      toast.error("Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div style={{
        padding: "var(--space-3)", borderRadius: "var(--radius-md)",
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
          <div>
            <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-1)" }}>
              Vendor Coordination
            </div>
            {vendorCoordination ? (
              <>
                <div style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
                  {VENDOR_COORDINATION_LABELS[vendorCoordination]}
                </div>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                  {VENDOR_COORDINATION_DESCRIPTIONS[vendorCoordination]}
                </div>
                {vendorCoordination === "concierge" && conciergeFeeCents != null && (
                  <div style={{ marginTop: "var(--space-1)", fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--color-primary)" }}>
                    Management fee: {formatCents(conciergeFeeCents)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                Not set — work is performed directly by Dovetails.
              </div>
            )}
          </div>
          {canEdit && (
            <button className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => setEditing(true)}>
              {vendorCoordination ? "Edit" : "Set"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: "var(--space-4)", borderRadius: "var(--radius-md)",
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      display: "flex", flexDirection: "column", gap: "var(--space-3)",
    }}>
      <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Vendor Coordination
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)" }}>Mode</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", cursor: "pointer" }}>
            <input type="radio" name="vc_mode" value="" checked={mode === ""} onChange={() => setMode("")} />
            <span>
              <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>None</span>
              <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>Work performed directly by Dovetails</span>
            </span>
          </label>
          {VENDOR_COORDINATION_MODES.map((m) => (
            <label key={m} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", cursor: "pointer" }}>
              <input type="radio" name="vc_mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              <span>
                <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{VENDOR_COORDINATION_LABELS[m]}</span>
                <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{VENDOR_COORDINATION_DESCRIPTIONS[m]}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {mode === "concierge" && (
        <div>
          <label className="p7-label">Management Fee</label>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>$</span>
            <input
              className="p7-input"
              type="number"
              min="0"
              step="0.01"
              value={feeDollars}
              onChange={(e) => setFeeDollars(e.target.value)}
              style={{ width: 100 }}
            />
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button className="p7-btn p7-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="p7-btn p7-btn-secondary" onClick={() => { setMode(vendorCoordination ?? ""); setEditing(false); }} disabled={saving}>
          Cancel
        </button>
        {vendorCoordination && (
          <button className="p7-btn p7-btn-ghost" onClick={handleClear} disabled={saving}
            style={{ color: "var(--color-error, #dc2626)", marginLeft: "auto" }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
