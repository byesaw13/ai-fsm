"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, useToast } from "@/components/ui";
import type { WorkOrderDraft, WorkOrderRoomLine } from "@ai-fsm/domain";
import { materialItemsToDraft } from "@ai-fsm/domain";

// TASK-018 slice 3: create/edit a work order. Everything is editable; materials
// can be AI-suggested (owner confirms/edits) or added by hand.

export interface MaterialRow {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  suggested?: boolean;
}

const STATUS_OPTIONS = ["draft", "scheduled", "in_progress", "completed", "cancelled"] as const;

export interface WorkOrderFormProps {
  mode: "create" | "edit";
  workOrderId?: string;
  clientId: string;
  clientName?: string | null;
  propertyId?: string | null;
  propertyAddress?: string | null;
  jobId?: string | null;
  sourceVisitId?: string | null;
  sourceAssessmentId?: string | null;
  initial: {
    title: string;
    scope: string;
    siteNotes: string;
    safetyNotes: string;
    rooms: WorkOrderRoomLine[];
    materials: MaterialRow[];
    status: (typeof STATUS_OPTIONS)[number];
  };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function WorkOrderForm(props: WorkOrderFormProps) {
  const router = useRouter();
  const toast = useToast();
  const { initial } = props;

  const [title, setTitle] = useState(initial.title);
  const [scope, setScope] = useState(initial.scope);
  const [siteNotes, setSiteNotes] = useState(initial.siteNotes);
  const [safetyNotes, setSafetyNotes] = useState(initial.safetyNotes);
  const [rooms, setRooms] = useState<WorkOrderRoomLine[]>(initial.rooms);
  const [materials, setMaterials] = useState<MaterialRow[]>(initial.materials);
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>(initial.status);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const total = materials.reduce((s, m) => s + (m.total_cents || 0), 0);

  function updateMaterial(i: number, patch: Partial<MaterialRow>) {
    setMaterials((rows) =>
      rows.map((m, idx) => {
        if (idx !== i) return m;
        const next = { ...m, ...patch };
        if (patch.quantity !== undefined || patch.unit_price_cents !== undefined) {
          next.total_cents = Math.round((next.quantity || 0) * (next.unit_price_cents || 0));
        }
        next.suggested = false; // edited → owner-owned
        return next;
      }),
    );
  }

  async function suggestMaterials() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/v1/estimates/ai-materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: scope.trim() || title,
          job_type: "general",
          ...(props.sourceVisitId ? { visit_id: props.sourceVisitId } : {}),
          ...(props.sourceAssessmentId ? { assessment_id: props.sourceAssessmentId } : {}),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error?.message ?? "Could not suggest materials");
        return;
      }
      const json = await res.json();
      const suggested = materialItemsToDraft(json?.data?.items ?? []).map((m) => ({
        description: m.description,
        quantity: m.quantity,
        unit_price_cents: m.unitCents,
        total_cents: m.totalCents,
        suggested: true,
      }));
      setMaterials((rows) => [...rows, ...suggested]);
      toast.success(`${suggested.length} suggested — review and confirm`);
    } finally {
      setSuggesting(false);
    }
  }

  async function save() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const body = {
        ...(props.mode === "create" ? { client_id: props.clientId } : {}),
        title: title.trim(),
        scope,
        site_notes: siteNotes,
        safety_notes: safetyNotes,
        rooms,
        status,
        materials: materials.map((m) => ({
          description: m.description,
          quantity: m.quantity,
          unit_price_cents: m.unit_price_cents,
          total_cents: m.total_cents,
        })),
        ...(props.mode === "create"
          ? {
              job_id: props.jobId ?? null,
              property_id: props.propertyId ?? null,
              source_visit_id: props.sourceVisitId ?? null,
              source_assessment_id: props.sourceAssessmentId ?? null,
            }
          : {}),
      };
      const url = props.mode === "create" ? `/api/v1/work-orders` : `/api/v1/work-orders/${props.workOrderId}`;
      const res = await fetch(url, {
        method: props.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error?.message ?? "Could not save work order");
        return;
      }
      const json = await res.json();
      toast.success("Work order saved");
      router.push(`/app/work-orders/${props.mode === "create" ? json.data.id : props.workOrderId}` as Route);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: "100%", padding: "var(--space-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" } as const;
  const labelStyle = { display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 4 } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
        {props.clientName ?? "Customer"}{props.propertyAddress ? ` · ${props.propertyAddress}` : ""}
      </p>

      <div><label style={labelStyle}>Title</label>
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></div>

      {props.mode === "edit" && (
        <div><label style={labelStyle}>Status</label>
          <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select></div>
      )}

      <div><label style={labelStyle}>Scope</label>
        <textarea style={{ ...inputStyle, minHeight: 120, fontFamily: "inherit" }} value={scope} onChange={(e) => setScope(e.target.value)} /></div>

      <div style={{ display: "grid", gap: "var(--space-3)", gridTemplateColumns: "1fr 1fr" }}>
        <div><label style={labelStyle}>Site notes</label>
          <textarea style={{ ...inputStyle, minHeight: 80, fontFamily: "inherit" }} value={siteNotes} onChange={(e) => setSiteNotes(e.target.value)} /></div>
        <div><label style={labelStyle}>Safety notes</label>
          <textarea style={{ ...inputStyle, minHeight: 80, fontFamily: "inherit" }} value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} /></div>
      </div>

      {rooms.length > 0 && (
        <div>
          <label style={labelStyle}>Room breakdown</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {rooms.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <span style={{ minWidth: 120, fontWeight: 600, fontSize: "var(--text-sm)" }}>
                  {r.name}{r.dimensions ? <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}> · {r.dimensions}</span> : null}
                </span>
                <input style={inputStyle} value={r.description}
                  onChange={(e) => setRooms((rs) => rs.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Materials · {dollars(total)}</label>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button size="sm" variant="ghost" loading={suggesting} onClick={suggestMaterials}>Suggest materials</Button>
            <Button size="sm" variant="ghost" onClick={() => setMaterials((m) => [...m, { description: "", quantity: 1, unit_price_cents: 0, total_cents: 0 }])}>+ Add</Button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {materials.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
              <input style={{ ...inputStyle, flex: 1, borderColor: m.suggested ? "var(--accent)" : "var(--border)" }}
                placeholder="Material" value={m.description} onChange={(e) => updateMaterial(i, { description: e.target.value })} />
              <input style={{ ...inputStyle, width: 64 }} type="number" min={0} value={m.quantity}
                onChange={(e) => updateMaterial(i, { quantity: parseFloat(e.target.value) || 0 })} />
              <input style={{ ...inputStyle, width: 90 }} type="number" min={0} placeholder="$ each"
                value={(m.unit_price_cents / 100).toString()}
                onChange={(e) => updateMaterial(i, { unit_price_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })} />
              <span style={{ width: 80, textAlign: "right", fontSize: "var(--text-sm)" }}>{dollars(m.total_cents)}</span>
              <button type="button" aria-label="Remove" onClick={() => setMaterials((rows) => rows.filter((_, idx) => idx !== i))}
                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: 18 }}>×</button>
            </div>
          ))}
          {materials.length === 0 && <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>No materials yet — suggest or add.</p>}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
        <Button variant="ghost" onClick={() => router.back()} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={saving}>{props.mode === "create" ? "Create work order" : "Save"}</Button>
      </div>
    </div>
  );
}
