"use client";

import { useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ASSESSMENT_TRADE_LABELS,
  buildAssessmentJobDescription,
  type AssessmentTradeKey,
} from "@ai-fsm/domain";
import { useToast } from "@/components/ui";
import { writeAssessmentContext } from "@/lib/estimates/assessment-context";
import { MaterialsGenerator } from "@/app/app/estimates/components/MaterialsGenerator";
import type { MaterialItem } from "@/app/app/estimates/components/MaterialsGenerator";
import { buildAiMaterialsDelta } from "@/lib/estimates/materials-delta";

const TRADE_KEYS = Object.keys(ASSESSMENT_TRADE_LABELS) as AssessmentTradeKey[];

export interface Room {
  id: string;
  name: string;
  length_ft: number | null;
  width_ft: number | null;
  height_ft: number | null;
  notes: string;
}

interface PhotoMeta {
  id: string;
  original_name: string;
  created_at: string;
}

export interface Assessment {
  id?: string;
  rooms: Room[];
  scope_notes: string | null;
  access_notes: string | null;
  has_pets: boolean;
  difficult_access: boolean;
  asbestos_risk: boolean;
  lead_paint_risk: boolean;
  total_sqft: number | null;
  completed_at: string | null;
  work_items?: string[] | null;
  prep_notes?: string | null;
  trade_notes?: Partial<Record<AssessmentTradeKey, string>> | null;
  customer_supplied_materials?: string | null;
}

interface Props {
  visitId: string;
  jobId: string | null;
  jobTitle: string | null;
  clientId: string | null;
  propertyId: string | null;
  initialAssessment: Assessment | null;
  initialPhotos: PhotoMeta[];
  canEdit: boolean;
}

function calcTotalSqft(rooms: Room[]): number {
  return rooms.reduce((sum, r) => {
    if (r.length_ft && r.width_ft) return sum + r.length_ft * r.width_ft;
    return sum;
  }, 0);
}

function newRoom(): Room {
  return { id: crypto.randomUUID(), name: "", length_ft: null, width_ft: null, height_ft: null, notes: "" };
}

export function AssessmentForm({ visitId, jobId, jobTitle, clientId, propertyId, initialAssessment, initialPhotos, canEdit }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [rooms, setRooms] = useState<Room[]>(
    initialAssessment?.rooms?.length ? initialAssessment.rooms : [newRoom()]
  );
  const [scopeNotes, setScopeNotes] = useState(initialAssessment?.scope_notes ?? "");
  const [accessNotes, setAccessNotes] = useState(initialAssessment?.access_notes ?? "");
  const [hasPets, setHasPets] = useState(initialAssessment?.has_pets ?? false);
  const [difficultAccess, setDifficultAccess] = useState(initialAssessment?.difficult_access ?? false);
  const [asbestosRisk, setAsbestosRisk] = useState(initialAssessment?.asbestos_risk ?? false);
  const [leadPaintRisk, setLeadPaintRisk] = useState(initialAssessment?.lead_paint_risk ?? false);
  // TASK-018 residual: structured scope the materials generator already consumes
  const [workItemsText, setWorkItemsText] = useState(
    (initialAssessment?.work_items ?? []).filter(Boolean).join("\n"),
  );
  const [prepNotes, setPrepNotes] = useState(initialAssessment?.prep_notes ?? "");
  const [tradeNotes, setTradeNotes] = useState<Partial<Record<AssessmentTradeKey, string>>>(
    () => initialAssessment?.trade_notes ?? {},
  );
  const [customerSupplied, setCustomerSupplied] = useState(
    initialAssessment?.customer_supplied_materials ?? "",
  );
  const [photos, setPhotos] = useState<PhotoMeta[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showMaterials, setShowMaterials] = useState(false);

  const totalSqft = calcTotalSqft(rooms);

  function updateRoom(idx: number, field: keyof Room, value: string | number | null) {
    setRooms((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function addRoom() {
    setRooms((prev) => [...prev, newRoom()]);
  }

  function removeRoom(idx: number) {
    setRooms((prev) => prev.filter((_, i) => i !== idx));
  }

  const workItemsList = useMemo(
    () =>
      workItemsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [workItemsText],
  );

  const buildPayload = useCallback(() => ({
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      length_ft: r.length_ft,
      width_ft: r.width_ft,
      height_ft: r.height_ft,
      notes: r.notes,
    })),
    scope_notes: scopeNotes || null,
    access_notes: accessNotes || null,
    has_pets: hasPets,
    difficult_access: difficultAccess,
    asbestos_risk: asbestosRisk,
    lead_paint_risk: leadPaintRisk,
    total_sqft: totalSqft > 0 ? totalSqft : null,
    work_items: workItemsList,
    prep_notes: prepNotes || null,
    trade_notes: Object.fromEntries(
      TRADE_KEYS.map((k) => [k, (tradeNotes[k] ?? "").trim()]).filter(([, v]) => v),
    ),
    customer_supplied_materials: customerSupplied || null,
  }), [
    rooms, scopeNotes, accessNotes, hasPets, difficultAccess, asbestosRisk, leadPaintRisk,
    totalSqft, workItemsList, prepNotes, tradeNotes, customerSupplied,
  ]);

  async function save(completedAt?: string | null) {
    setError(null);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/assessment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), completed_at: completedAt ?? null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Save failed");
        return false;
      }
      setSavedAt(new Date().toLocaleTimeString());
      return true;
    } catch {
      setError("Network error — try again");
      return false;
    }
  }

  async function handleSave() {
    setSaving(true);
    await save(null);
    setSaving(false);
  }

  async function handleComplete() {
    setCompleting(true);
    const ok = await save(new Date().toISOString());
    setCompleting(false);
    if (ok) router.push(`/app/visits/${visitId}`);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const failures: string[] = [];
    let lastErrorMessage: string | null = null;
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(files.length > 1 ? `${i + 1} of ${files.length}` : null);
        const file = files[i];
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("category", "assessment");
          const res = await fetch(`/api/v1/visits/${visitId}/media`, { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok) {
            failures.push(file.name);
            lastErrorMessage = data.error?.message ?? "Upload failed";
          } else {
            setPhotos((prev) => [...prev, data.data]);
          }
        } catch {
          failures.push(file.name);
          lastErrorMessage = "Upload failed";
        }
      }
      const uploaded = files.length - failures.length;
      if (uploaded > 0) {
        toast.success(uploaded === 1 ? "Photo uploaded" : `${uploaded} photos uploaded`);
      }
      if (failures.length > 0) {
        const message =
          files.length === 1
            ? lastErrorMessage ?? "Upload failed"
            : `${failures.length} of ${files.length} photos failed to upload (${failures.join(", ")})`;
        setUploadError(message);
        toast.error(message);
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (e.target) e.target.value = "";
    }
  }

  async function handleDeletePhoto(photoId: string) {
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/media/${photoId}`, { method: "DELETE" });
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      }
    } catch { /* ignore */ }
  }

  const disabled = !canEdit || saving || completing;

  // Seed the materials generator with the full assessment, not just scope
  // notes. The generator's scope textarea stays editable as the preview.
  const generatedJobDescription = useMemo(
    () =>
      buildAssessmentJobDescription({
        rooms,
        scope_notes: scopeNotes,
        access_notes: accessNotes,
        has_pets: hasPets,
        difficult_access: difficultAccess,
        asbestos_risk: asbestosRisk,
        lead_paint_risk: leadPaintRisk,
        total_sqft: totalSqft > 0 ? totalSqft : null,
        photo_count: photos.length,
        work_items: workItemsList,
        prep_notes: prepNotes || null,
        trade_notes: tradeNotes,
        customer_supplied_materials: customerSupplied || null,
      }),
    [
      rooms, scopeNotes, accessNotes, hasPets, difficultAccess, asbestosRisk, leadPaintRisk,
      totalSqft, photos.length, workItemsList, prepNotes, tradeNotes, customerSupplied,
    ],
  );

  return (
    <div className="p7-form-stack" style={{ maxWidth: 680 }}>
      {error && <div className="p7-card-danger" role="alert">{error}</div>}
      {savedAt && !error && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          Saved at {savedAt}
        </div>
      )}

      {/* Rooms */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Rooms / Areas</h3>
          {totalSqft > 0 && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              Total: {totalSqft.toFixed(0)} sqft
            </span>
          )}
        </div>

        {rooms.map((room, idx) => (
          <div
            key={room.id}
            style={{
              padding: "var(--space-3)",
              marginBottom: "var(--space-2)",
              background: "var(--bg-subtle)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)", alignItems: "flex-start" }}>
              <div style={{ flex: "2 1 140px" }}>
                <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Room / Area</label>
                <input
                  type="text"
                  value={room.name}
                  placeholder="Living Room, Kitchen…"
                  onChange={(e) => updateRoom(idx, "name", e.target.value)}
                  disabled={disabled}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: "1 1 70px" }}>
                <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>L (ft)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={room.length_ft ?? ""}
                  onChange={(e) => updateRoom(idx, "length_ft", e.target.value ? parseFloat(e.target.value) : null)}
                  disabled={disabled}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: "1 1 70px" }}>
                <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>W (ft)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={room.width_ft ?? ""}
                  onChange={(e) => updateRoom(idx, "width_ft", e.target.value ? parseFloat(e.target.value) : null)}
                  disabled={disabled}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: "1 1 70px" }}>
                <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>H (ft)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={room.height_ft ?? ""}
                  onChange={(e) => updateRoom(idx, "height_ft", e.target.value ? parseFloat(e.target.value) : null)}
                  disabled={disabled}
                  style={{ width: "100%" }}
                />
              </div>
              {canEdit && rooms.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRoom(idx)}
                  disabled={disabled}
                  style={{ marginTop: "var(--space-4)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}
                  aria-label="Remove room"
                >
                  ✕
                </button>
              )}
            </div>
            {room.length_ft && room.width_ft && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
                {(room.length_ft * room.width_ft).toFixed(0)} sqft
              </div>
            )}
            <div>
              <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Notes</label>
              <input
                type="text"
                value={room.notes}
                placeholder="Crown moulding, water damage, accent wall…"
                onChange={(e) => updateRoom(idx, "notes", e.target.value)}
                disabled={disabled}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        ))}

        {canEdit && (
          <button
            type="button"
            onClick={addRoom}
            disabled={disabled}
            className="p7-btn p7-btn-ghost p7-btn-sm"
          >
            + Add Room / Area
          </button>
        )}
      </section>

      {/* Site Conditions */}
      <section>
        <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 600 }}>Site Conditions</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
          {([
            ["has_pets", "Pets on site", hasPets, setHasPets],
            ["difficult_access", "Difficult access", difficultAccess, setDifficultAccess],
            ["asbestos_risk", "Asbestos risk", asbestosRisk, setAsbestosRisk],
            ["lead_paint_risk", "Lead paint risk", leadPaintRisk, setLeadPaintRisk],
          ] as [string, string, boolean, (v: boolean) => void][]).map(([key, label, val, setter]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: canEdit ? "pointer" : "default" }}>
              <input
                type="checkbox"
                checked={val}
                onChange={(e) => setter(e.target.checked)}
                disabled={disabled}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      {/* Scope Notes */}
      <section>
        <label htmlFor="scope_notes" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
          Scope Notes
        </label>
        <textarea
          id="scope_notes"
          rows={5}
          value={scopeNotes}
          onChange={(e) => setScopeNotes(e.target.value)}
          placeholder="Describe what needs to be done, materials needed, special considerations…"
          disabled={disabled}
          style={{ width: "100%", fontFamily: "inherit", fontSize: "var(--text-sm)" }}
        />
      </section>

      {/* Work items (TASK-018 residual) */}
      <section>
        <label htmlFor="work_items" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
          Work items <span style={{ fontWeight: 400, color: "var(--fg-muted)" }}>(one per line)</span>
        </label>
        <textarea
          id="work_items"
          rows={4}
          value={workItemsText}
          onChange={(e) => setWorkItemsText(e.target.value)}
          placeholder={"Paint ceiling\nInstall baseboard\nPatch drywall"}
          disabled={disabled}
          data-testid="assessment-work-items"
          style={{ width: "100%", fontFamily: "inherit", fontSize: "var(--text-sm)" }}
        />
      </section>

      {/* Prep notes */}
      <section>
        <label htmlFor="prep_notes" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
          Prep notes
        </label>
        <textarea
          id="prep_notes"
          rows={3}
          value={prepNotes}
          onChange={(e) => setPrepNotes(e.target.value)}
          placeholder="Mask floors, move furniture, prime raw drywall…"
          disabled={disabled}
          data-testid="assessment-prep-notes"
          style={{ width: "100%", fontFamily: "inherit", fontSize: "var(--text-sm)" }}
        />
      </section>

      {/* Trade notes */}
      <section>
        <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
          Trade notes
        </h3>
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          {TRADE_KEYS.map((key) => (
            <div key={key}>
              <label
                htmlFor={`trade_${key}`}
                style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, marginBottom: 2, color: "var(--fg-muted)" }}
              >
                {ASSESSMENT_TRADE_LABELS[key]}
              </label>
              <input
                id={`trade_${key}`}
                type="text"
                value={tradeNotes[key] ?? ""}
                onChange={(e) => setTradeNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={`${ASSESSMENT_TRADE_LABELS[key]} notes…`}
                disabled={disabled}
                data-testid={`assessment-trade-${key}`}
                style={{ width: "100%", fontFamily: "inherit", fontSize: "var(--text-sm)" }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Customer-supplied materials */}
      <section>
        <label htmlFor="customer_supplied" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
          Customer-supplied materials
        </label>
        <textarea
          id="customer_supplied"
          rows={2}
          value={customerSupplied}
          onChange={(e) => setCustomerSupplied(e.target.value)}
          placeholder="Customer providing paint, vanity, fixtures…"
          disabled={disabled}
          data-testid="assessment-customer-supplied"
          style={{ width: "100%", fontFamily: "inherit", fontSize: "var(--text-sm)" }}
        />
      </section>

      {/* Access Notes */}
      <section>
        <label htmlFor="access_notes" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
          Access Notes
        </label>
        <textarea
          id="access_notes"
          rows={3}
          value={accessNotes}
          onChange={(e) => setAccessNotes(e.target.value)}
          placeholder="Gate code, key location, parking, dog in yard…"
          disabled={disabled}
          style={{ width: "100%", fontFamily: "inherit", fontSize: "var(--text-sm)" }}
        />
      </section>

      {/* Photos */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>
            Assessment Photos ({photos.length})
          </h3>
          {canEdit && (
            <label
              style={{
                display: "inline-block",
                padding: "var(--space-1) var(--space-3)",
                fontSize: "var(--text-xs)",
                cursor: uploading ? "default" : "pointer",
                opacity: uploading ? 0.6 : 1,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
              }}
            >
              {uploading ? `Uploading${uploadProgress ? ` ${uploadProgress}` : ""}…` : "+ Add Photos"}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </label>
          )}
        </div>
        {uploadError && (
          <div className="p7-card-danger" role="alert" style={{ marginBottom: "var(--space-2)" }}>
            {uploadError}
          </div>
        )}
        {photos.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "var(--space-2)" }}>
            {photos.map((photo) => (
              <div key={photo.id} style={{ position: "relative" }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "1" }}>
                  <Image
                    src={`/api/v1/visits/${visitId}/media/${photo.id}/image`}
                    alt={photo.original_name}
                    fill
                    sizes="120px"
                    style={{ objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}
                  />
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id)}
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      background: "rgba(0,0,0,0.55)",
                      border: "none",
                      borderRadius: "50%",
                      color: "#fff",
                      width: 20,
                      height: 20,
                      cursor: "pointer",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                    }}
                    aria-label="Delete photo"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", margin: 0 }}>
            No photos yet. Use the camera button to capture measurements and site conditions.
          </p>
        )}
      </section>

      {/* Materials Generator */}
      <section style={{ paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showMaterials ? "var(--space-3)" : 0 }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Materials List</h3>
          {!showMaterials && (
            <button
              type="button"
              onClick={() => setShowMaterials(true)}
              className="p7-btn p7-btn-ghost p7-btn-sm"
            >
              Generate Materials →
            </button>
          )}
        </div>
        {showMaterials && (
          <MaterialsGenerator
            initialScope={generatedJobDescription}
            rooms={rooms}
            visitId={visitId}
            assessmentId={initialAssessment?.id ?? null}
            onAddToEstimate={(matItems: MaterialItem[]) => {
              const params = new URLSearchParams();
              if (clientId) params.set("client_id", clientId);
              if (jobId) params.set("job_id", jobId);
              if (propertyId) params.set("property_id", propertyId);
              // Carry the source visit so the estimate page can recover the
              // assessment summary from persistence if sessionStorage is gone.
              params.set("visit_id", visitId);
              // Store generated materials in sessionStorage for the estimate form to pick up.
              // Same delta-capture pattern as Step2Pricing.tsx's onAddToEstimate — this is a
              // SEPARATE entry point into the estimate form (sessionStorage hand-off, not the
              // in-page MaterialsGenerator flow), so it must carry the AI-proposed vs.
              // founder-edited delta through independently (TASK T1, materials trust calibration).
              const keys = matItems.map(() => crypto.randomUUID());
              const lineItems = matItems.map((m, i) => ({
                description: `${m.name}${m.brand ? ` (${m.brand})` : ""} — ${m.quantity} ${m.unit}`,
                quantity: "1",
                unit_price: (m.total_cost_cents / 100).toFixed(2),
                ai_delta_key: m.ai_quantity !== undefined ? keys[i] : undefined,
              }));
              sessionStorage.setItem("estimate_prefill_materials", JSON.stringify(lineItems));
              const delta = buildAiMaterialsDelta(matItems, keys);
              if (delta.length > 0) {
                sessionStorage.setItem("estimate_prefill_materials_delta", JSON.stringify(delta));
              }
              // Carry the assessment context so the estimate-page materials
              // generator keeps the generated description + room measurements.
              writeAssessmentContext({
                generatedJobDescription,
                rooms,
                visitId,
                assessmentId: initialAssessment?.id ?? null,
              });
              router.push(`/app/estimates/new?${params.toString()}&from_assessment=1`);
            }}
            onClose={() => setShowMaterials(false)}
          />
        )}
      </section>

      {canEdit && (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || completing}
            className="p7-btn p7-btn-secondary p7-btn-sm"
          >
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={handleComplete}
            disabled={saving || completing}
            className="p7-btn p7-btn-primary p7-btn-sm"
          >
            {completing ? "Completing…" : "Mark Assessment Complete"}
          </button>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              if (clientId) params.set("client_id", clientId);
              if (jobId) params.set("job_id", jobId);
              if (propertyId) params.set("property_id", propertyId);
              params.set("visit_id", visitId);
              router.push(`/app/work-orders/new?${params.toString()}` as Route);
            }}
            className="p7-btn p7-btn-ghost p7-btn-sm"
          >
            Prepare Work Order Draft →
          </button>
          <a href={`/app/visits/${visitId}`} className="p7-btn p7-btn-ghost p7-btn-sm">
            Back to Visit
          </a>
        </div>
      )}
    </div>
  );
}
