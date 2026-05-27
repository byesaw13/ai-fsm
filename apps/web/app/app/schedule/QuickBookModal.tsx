"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface UserOption { id: string; full_name: string; role: string; }
interface ClientResult { id: string; name: string; }

interface Props {
  initialDate: string;        // YYYY-MM-DD
  onClose: () => void;
}

const JOB_TYPE_OPTIONS = [
  { value: "repair",       label: "Repair" },
  { value: "carpentry",    label: "Carpentry" },
  { value: "maintenance",  label: "Maintenance" },
  { value: "painting",     label: "Painting" },
  { value: "plumbing",     label: "Plumbing" },
  { value: "electrical",   label: "Electrical" },
  { value: "hvac",         label: "HVAC" },
  { value: "roofing",      label: "Roofing" },
  { value: "flooring",     label: "Flooring" },
  { value: "windows_doors",label: "Windows / Doors" },
  { value: "appliances",   label: "Appliances" },
  { value: "drywall",      label: "Drywall" },
  { value: "landscaping",  label: "Landscaping" },
  { value: "custom",       label: "Other / Custom" },
];

const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 6; h <= 20; h++) {
  for (const m of [0, 30]) {
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const suffix = h < 12 ? "AM" : h === 12 ? "PM" : "PM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    TIME_OPTIONS.push({ value: `${hh}:${mm}`, label: `${displayH}:${mm} ${suffix}` });
  }
}

const DURATION_OPTIONS = [
  { value: 60,  label: "1 hour" },
  { value: 90,  label: "1.5 hours" },
  { value: 120, label: "2 hours" },
  { value: 150, label: "2.5 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4 hours" },
  { value: 300, label: "5 hours" },
  { value: 360, label: "6 hours" },
  { value: 480, label: "8 hours" },
];

function buildISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function QuickBookModal({ initialDate, onClose }: Props) {
  const router = useRouter();

  // Client search
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [createNew, setCreateNew] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Job fields
  const [jobTitle, setJobTitle] = useState("");
  const [jobType, setJobType] = useState("repair");
  const [notes, setNotes] = useState("");

  // Schedule
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("08:00");
  const [duration, setDuration] = useState(120);

  // Assignment
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assignedUserId, setAssignedUserId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load users on mount
  useEffect(() => {
    fetch("/api/v1/users")
      .then(r => r.json())
      .then((d: { data?: UserOption[] }) => setUsers(d.data ?? []))
      .catch(() => {});
  }, []);

  // Debounced client search
  const searchClients = useCallback((q: string) => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (!q.trim()) { setClientResults([]); setShowDropdown(false); return; }
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/clients?q=${encodeURIComponent(q)}&limit=8`);
        const data = await res.json() as { data?: ClientResult[] };
        setClientResults(data.data ?? []);
        setShowDropdown(true);
      } catch { setClientResults([]); }
    }, 250);
  }, []);

  function handleClientInput(value: string) {
    setClientQuery(value);
    setSelectedClient(null);
    setCreateNew(false);
    searchClients(value);
  }

  function selectClient(c: ClientResult) {
    setSelectedClient(c);
    setClientQuery(c.name);
    setShowDropdown(false);
    setCreateNew(false);
  }

  function selectCreateNew() {
    setSelectedClient(null);
    setCreateNew(true);
    setShowDropdown(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientQuery.trim()) { setError("Client name is required"); return; }
    if (!jobTitle.trim()) { setError("Job title is required"); return; }
    setError(null);
    setSubmitting(true);

    const endMs = new Date(`${date}T${startTime}:00`).getTime() + duration * 60_000;
    const endISO = new Date(endMs).toISOString();

    const payload: Record<string, unknown> = {
      job_title: jobTitle.trim(),
      job_type: jobType,
      scheduled_start: buildISO(date, startTime),
      scheduled_end: endISO,
    };
    if (notes.trim()) payload.notes = notes.trim();
    if (assignedUserId) payload.assigned_user_id = assignedUserId;

    if (selectedClient) {
      payload.client_id = selectedClient.id;
    } else {
      payload.client_name = clientQuery.trim();
    }

    try {
      const res = await fetch("/api/v1/quick-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { data?: { job_id: string }; error?: { message?: string } };
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to create booking");
        return;
      }
      router.refresh();
      onClose();
      if (data.data?.job_id) {
        router.push(`/app/jobs/${data.data.job_id}`);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  // Computed end time label
  const endMs = new Date(`${date}T${startTime}:00`).getTime() + duration * 60_000;
  const endLabel = new Date(endMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Book"
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-4)" }}
    >
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />

      {/* Modal */}
      <div style={{ position: "relative", background: "#fff", borderRadius: 12, padding: "var(--space-5)", width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 }}>Quick Book</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--fg-muted)", lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>

          {/* Client */}
          <div style={{ position: "relative" }}>
            <label style={labelStyle}>Client</label>
            <input
              type="text"
              placeholder="Search or enter new client name…"
              value={clientQuery}
              onChange={(e) => handleClientInput(e.target.value)}
              onFocus={() => { if (clientResults.length > 0) setShowDropdown(true); }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              autoComplete="off"
              style={inputStyle}
            />
            {selectedClient && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--accent)", marginTop: 3 }}>✓ Existing client</div>
            )}
            {createNew && (
              <div style={{ fontSize: "var(--text-xs)", color: "#16a34a", marginTop: 3 }}>✓ Will create new client &ldquo;{clientQuery}&rdquo;</div>
            )}
            {showDropdown && (clientResults.length > 0 || clientQuery.trim()) && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 10, marginTop: 2 }}>
                {clientResults.map(c => (
                  <button key={c.id} type="button" onMouseDown={() => selectClient(c)} style={dropdownItemStyle}>
                    {c.name}
                  </button>
                ))}
                {clientQuery.trim() && (
                  <button type="button" onMouseDown={selectCreateNew} style={{ ...dropdownItemStyle, color: "var(--accent)", fontWeight: 600 }}>
                    + Create &ldquo;{clientQuery}&rdquo;
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Job title */}
          <div>
            <label style={labelStyle}>Job title</label>
            <input
              type="text"
              placeholder="e.g. Fix kitchen faucet, Deck repair…"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {/* Job type */}
          <div>
            <label style={labelStyle}>Type</label>
            <select value={jobType} onChange={(e) => setJobType(e.target.value)} style={inputStyle}>
              {JOB_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Date + time + duration */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Start time</label>
              <select value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle}>
                {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Duration</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={inputStyle}>
              {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 3 }}>
              Ends at {endLabel}
            </div>
          </div>

          {/* Assign tech */}
          {users.length > 0 && (
            <div>
              <label style={labelStyle}>Assign to (optional)</label>
              <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} style={inputStyle}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details about the job…"
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {error && (
            <div style={{ padding: "var(--space-2) var(--space-3)", background: "rgba(220,38,38,0.08)", borderRadius: 6, color: "#dc2626", fontSize: "var(--text-sm)" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", paddingTop: "var(--space-2)" }}>
            <button type="button" onClick={onClose} style={{ ...btnStyle, background: "var(--bg-muted, #f4f4f5)", color: "var(--fg)" }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} style={{ ...btnStyle, background: "var(--accent)", color: "#fff", opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "Booking…" : "Book Visit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  color: "var(--fg)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: "var(--text-sm)",
  color: "var(--fg)",
  background: "#fff",
  boxSizing: "border-box",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 12px",
  textAlign: "left",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  color: "var(--fg)",
};

const btnStyle: React.CSSProperties = {
  padding: "8px 20px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
};
