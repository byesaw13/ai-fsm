"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui";
import {
  computeRoomMeasurements,
  computePaintingProject,
  computeEstimate,
  roomSpecsToEstimateSpec,
  CURRENT_RULES,
} from "@ai-fsm/domain";
import type { RoomSpec, RoomPrepLevel, PaintGrade, PaintSupplier, ProjectOptions, EstimateResult } from "@ai-fsm/domain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoomByRoomEditorProps {
  rooms: RoomSpec[];
  options: ProjectOptions;
  onChange: (rooms: RoomSpec[], options: ProjectOptions, result: EstimateResult) => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_ROOM: RoomSpec = {
  name: "",
  length_ft: 0,
  width_ft: 0,
  ceiling_height_ft: 8,
  doors: 1,
  windows: 2,
  include_ceiling: false,
  include_trim: true,
  prep_level: "minor",
  paint_supplied_by: "dovetails",
  paint_grade: "standard",
  primer_needed: false,
  dark_to_light: false,
};

const PREP_LABELS: Record<RoomPrepLevel, string> = {
  clean:    "Clean (wipe + paint)",
  minor:    "Minor (patch holes, light sand)",
  moderate: "Moderate (larger patches, caulk, sand)",
  major:    "Major (skim coat, heavy repair)",
};

const GRADE_LABELS: Record<PaintGrade, string> = {
  economy:  "Economy ($35/gal)",
  standard: "Standard ($55/gal)",
  premium:  "Premium ($75/gal)",
  designer: "Designer ($95/gal)",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

function sqftPreview(room: RoomSpec): string {
  if (!room.length_ft || !room.width_ft || !room.ceiling_height_ft) return "—";
  const m = computeRoomMeasurements(room);
  const parts = [`${m.wall_sqft.toFixed(0)} sqft walls`];
  if (m.ceiling_sqft > 0) parts.push(`${m.ceiling_sqft.toFixed(0)} sqft ceiling`);
  if (m.trim_lf > 0) parts.push(`${m.trim_lf.toFixed(0)} LF trim`);
  return parts.join(" · ");
}

const ROOM_PRESETS = [
  { label: "Bedroom", length_ft: 12, width_ft: 11, ceiling_height_ft: 8, doors: 1, windows: 2 },
  { label: "Master Bed", length_ft: 14, width_ft: 13, ceiling_height_ft: 8, doors: 1, windows: 2 },
  { label: "Living Room", length_ft: 18, width_ft: 14, ceiling_height_ft: 8, doors: 2, windows: 3 },
  { label: "Kitchen", length_ft: 12, width_ft: 10, ceiling_height_ft: 8, doors: 2, windows: 1 },
  { label: "Bathroom", length_ft: 8, width_ft: 6, ceiling_height_ft: 8, doors: 1, windows: 1 },
  { label: "Hallway", length_ft: 15, width_ft: 4, ceiling_height_ft: 8, doors: 2, windows: 0 },
];

// ---------------------------------------------------------------------------
// Single room editor
// ---------------------------------------------------------------------------

function RoomCard({
  room,
  index,
  onUpdate,
  onRemove,
  canRemove,
}: {
  room: RoomSpec;
  index: number;
  onUpdate: (updated: RoomSpec) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const preview = sqftPreview(room);

  function field<K extends keyof RoomSpec>(key: K, value: RoomSpec[K]) {
    onUpdate({ ...room, [key]: value });
  }

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      background: "var(--bg-surface)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-2) var(--space-3)",
          background: "var(--bg-subtle)",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: "var(--space-2)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
            {room.name || `Room ${index + 1}`}
          </span>
          {!expanded && preview !== "—" && (
            <span style={{ marginLeft: 8, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              {preview}
            </span>
          )}
        </div>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>

          {/* Room name + presets */}
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, display: "block", marginBottom: 4 }}>
                Room name
              </label>
              <input
                value={room.name}
                onChange={(e) => field("name", e.target.value)}
                placeholder="e.g. Living Room"
               
              />
            </div>
            <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap" }}>
              {ROOM_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onUpdate({
                    ...room,
                    name: room.name || p.label,
                    length_ft: p.length_ft,
                    width_ft: p.width_ft,
                    ceiling_height_ft: p.ceiling_height_ft,
                    doors: p.doors,
                    windows: p.windows,
                  })}
                  style={{
                    fontSize: "var(--text-xs)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-subtle)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, margin: "0 0 var(--space-1)" }}>
              Dimensions
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-2)" }}>
              {(["length_ft", "width_ft", "ceiling_height_ft"] as const).map((key) => (
                <div key={key}>
                  <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", display: "block", marginBottom: 2 }}>
                    {key === "length_ft" ? "Length (ft)" : key === "width_ft" ? "Width (ft)" : "Ceiling (ft)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={room[key] || ""}
                    onChange={(e) => field(key, parseFloat(e.target.value) || 0)}
                   
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <div>
                <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", display: "block", marginBottom: 2 }}>Doors</label>
                <input type="number" min="0" value={room.doors} onChange={(e) => field("doors", parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", display: "block", marginBottom: 2 }}>Windows</label>
                <input type="number" min="0" value={room.windows} onChange={(e) => field("windows", parseInt(e.target.value) || 0)} />
              </div>
            </div>
            {preview !== "—" && (
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "#0284c7" }}>
                → {preview}
              </p>
            )}
          </div>

          {/* What's included */}
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {(["include_ceiling", "include_trim", "primer_needed", "dark_to_light"] as const).map((key) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                <input type="checkbox" checked={room[key] as boolean} onChange={(e) => field(key, e.target.checked)} />
                {key === "include_ceiling" ? "Ceiling" : key === "include_trim" ? "Trim / baseboard" : key === "primer_needed" ? "Primer needed" : "Dark-to-light color change"}
              </label>
            ))}
          </div>

          {/* Prep level */}
          <div>
            <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, display: "block", marginBottom: "var(--space-1)" }}>
              Prep level
            </label>
            <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap" }}>
              {(Object.keys(PREP_LABELS) as RoomPrepLevel[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => field("prep_level", level)}
                  style={{
                    fontSize: "var(--text-xs)",
                    padding: "4px 10px",
                    borderRadius: "var(--radius-sm)",
                    border: `1px solid ${room.prep_level === level ? "var(--accent)" : "var(--border)"}`,
                    background: room.prep_level === level ? "var(--accent)" : "var(--bg-subtle)",
                    color: room.prep_level === level ? "#fff" : "var(--fg)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {PREP_LABELS[level].split(" (")[0]}
                </button>
              ))}
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              {PREP_LABELS[room.prep_level]}
            </p>
          </div>

          {/* Paint */}
          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, display: "block", marginBottom: "var(--space-1)" }}>
                Paint supplied by
              </label>
              <div style={{ display: "flex", gap: "var(--space-1)" }}>
                {(["dovetails", "customer"] as PaintSupplier[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => field("paint_supplied_by", s)}
                    style={{
                      fontSize: "var(--text-xs)",
                      padding: "4px 10px",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${room.paint_supplied_by === s ? "var(--accent)" : "var(--border)"}`,
                      background: room.paint_supplied_by === s ? "var(--accent)" : "var(--bg-subtle)",
                      color: room.paint_supplied_by === s ? "#fff" : "var(--fg)",
                      cursor: "pointer",
                    }}
                  >
                    {s === "dovetails" ? "Dovetails supplies" : "Client supplies"}
                  </button>
                ))}
              </div>
            </div>

            {room.paint_supplied_by === "dovetails" && (
              <div>
                <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, display: "block", marginBottom: "var(--space-1)" }}>
                  Paint grade
                </label>
                <select
                  value={room.paint_grade}
                  onChange={(e) => field("paint_grade", e.target.value as PaintGrade)}
                  style={{
                    fontSize: "var(--text-xs)",
                    padding: "4px 8px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                  }}
                >
                  {(Object.keys(GRADE_LABELS) as PaintGrade[]).map((g) => (
                    <option key={g} value={g}>{GRADE_LABELS[g]}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Remove */}
          {canRemove && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={onRemove}>
                Remove room
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export function RoomByRoomEditor({ rooms, options, onChange }: RoomByRoomEditorProps) {
  const recompute = useCallback((nextRooms: RoomSpec[], nextOptions: ProjectOptions) => {
    const spec = roomSpecsToEstimateSpec(nextRooms, nextOptions);
    const result = computeEstimate(spec, CURRENT_RULES);
    onChange(nextRooms, nextOptions, result);
  }, [onChange]);

  function addRoom() {
    const next = [...rooms, { ...DEFAULT_ROOM }];
    recompute(next, options);
  }

  function updateRoom(index: number, updated: RoomSpec) {
    const next = rooms.map((r, i) => (i === index ? updated : r));
    recompute(next, options);
  }

  function removeRoom(index: number) {
    const next = rooms.filter((_, i) => i !== index);
    recompute(next, options);
  }

  function updateOptions(updates: Partial<ProjectOptions>) {
    const next = { ...options, ...updates };
    recompute(rooms, next);
  }

  const hasValidRooms = rooms.some((r) => r.length_ft > 0 && r.width_ft > 0);
  const metrics = hasValidRooms ? computePaintingProject(rooms, options) : null;
  const engineResult = hasValidRooms
    ? computeEstimate(roomSpecsToEstimateSpec(rooms, options), CURRENT_RULES)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>

      {/* Project-level options */}
      <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, display: "block", marginBottom: 4 }}>
            Number of coats
          </label>
          <select
            value={options.coat_count}
            onChange={(e) => updateOptions({ coat_count: parseInt(e.target.value) })}
            style={{ fontSize: "var(--text-sm)", padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-surface)" }}
          >
            <option value={1}>1 coat</option>
            <option value={2}>2 coats (standard)</option>
            <option value={3}>3 coats</option>
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
          <input type="checkbox" checked={options.occupied_home} onChange={(e) => updateOptions({ occupied_home: e.target.checked })} />
          Occupied home (affects scheduling)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
          <input type="checkbox" checked={options.vaulted_ceilings} onChange={(e) => updateOptions({ vaulted_ceilings: e.target.checked })} />
          Vaulted ceilings present
        </label>
      </div>

      {/* Room cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {rooms.map((room, i) => (
          <RoomCard
            key={i}
            room={room}
            index={i}
            onUpdate={(u) => updateRoom(i, u)}
            onRemove={() => removeRoom(i)}
            canRemove={rooms.length > 1}
          />
        ))}
      </div>

      <Button type="button" variant="secondary" onClick={addRoom}>
        + Add room
      </Button>

      {/* Live estimate preview */}
      {metrics && engineResult && (
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-3)",
          background: "var(--bg-subtle)",
        }}>
          <p style={{ margin: "0 0 var(--space-2)", fontWeight: 700, fontSize: "var(--text-sm)" }}>
            Estimate preview
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "var(--space-2)" }}>
            {[
              { label: "Wall area", value: `${metrics.total_wall_sqft.toFixed(0)} sqft` },
              { label: "Ceiling", value: metrics.total_ceiling_sqft > 0 ? `${metrics.total_ceiling_sqft.toFixed(0)} sqft` : "—" },
              { label: "Trim", value: metrics.total_trim_lf > 0 ? `${metrics.total_trim_lf.toFixed(0)} LF` : "—" },
              { label: "Paint", value: metrics.total_paint_gallons > 0 ? `${metrics.total_paint_gallons} gal` : "Client supplied" },
              ...(metrics.total_primer_gallons > 0 ? [{ label: "Primer", value: `${metrics.total_primer_gallons} gal` }] : []),
              { label: "Labor", value: formatDollars(engineResult.summary.laborCents) },
              ...(engineResult.summary.materialCents > 0 ? [{ label: "Materials", value: formatDollars(engineResult.summary.materialCents) }] : []),
              { label: "Est. total", value: formatDollars(engineResult.summary.totalCents) },
              ...(engineResult.summary.depositCents > 0 ? [{ label: "Deposit due", value: formatDollars(engineResult.summary.depositCents) }] : []),
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{label}</p>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--text-sm)" }}>{value}</p>
              </div>
            ))}
          </div>
          {engineResult.internalSummary.grossMarginPct < 0.30 && (
            <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "#dc2626" }}>
              ⚠ Margin {(engineResult.internalSummary.grossMarginPct * 100).toFixed(1)}% is below the 30% floor — check pricing.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
