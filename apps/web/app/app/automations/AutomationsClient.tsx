"use client";

import { useState } from "react";

type AutomationType = "visit_reminder" | "invoice_followup" | "booking_confirmed" | "review_request";

interface AutomationRow {
  id: string;
  type: AutomationType;
  enabled: boolean;
  config: Record<string, unknown>;
  next_run_at: string | null;
  last_run_at: string | null;
}

interface EventStats {
  last_24h: { sent: number; errors: number };
  last_7d: { sent: number; errors: number };
}

interface AuditEventRow {
  id: string;
  entity_type: string;
  entity_id: string;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  visitReminder: AutomationRow | null;
  invoiceFollowup: AutomationRow | null;
  bookingConfirmed: AutomationRow | null;
  reviewRequest: AutomationRow | null;
  visitReminderStats: EventStats;
  invoiceFollowupStats: EventStats;
  bookingConfirmedStats: EventStats;
  reviewRequestStats: EventStats;
  recentEvents: AuditEventRow[];
  isAdmin: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function summarizeEvent(event: AuditEventRow): string {
  const val = event.new_value;
  if (!val) return `${event.entity_type} event`;

  if (event.entity_type === "visit_reminder") {
    return `Reminder sent to ${val.client_name ?? "client"} for "${val.job_title ?? "visit"}"`;
  }
  if (event.entity_type === "invoice_followup") {
    return `Follow-up (day ${val.days_overdue_step ?? "?"}) sent for invoice #${val.invoice_number ?? "?"} — ${val.client_name ?? ""}`;
  }
  if (event.entity_type === "booking_confirmed") {
    return `Booking confirmation sent to ${val.client_name ?? "client"} for "${val.job_title ?? "visit"}"`;
  }
  if (event.entity_type === "review_request") {
    return `Review request sent to ${val.client_name ?? "client"} for "${val.job_title ?? "job"}"`;
  }
  return `${event.entity_type} event`;
}

function eventIcon(type: string): string {
  if (type === "visit_reminder") return "🔔";
  if (type === "invoice_followup") return "📧";
  if (type === "booking_confirmed") return "✅";
  if (type === "review_request") return "⭐";
  return "📌";
}

function eventLabel(type: string): string {
  if (type === "visit_reminder") return "Reminder";
  if (type === "invoice_followup") return "Follow-up";
  if (type === "booking_confirmed") return "Booking";
  if (type === "review_request") return "Review";
  return type;
}

// ---------------------------------------------------------------------------
// Create forms
// ---------------------------------------------------------------------------

function CreateVisitReminderForm() {
  const [hoursBefore, setHoursBefore] = useState(24);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/v1/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "visit_reminder", config: { hours_before: hoursBefore } }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to create automation");
        return;
      }
      window.location.reload();
    } catch { setError("Unexpected error"); } finally { setPending(false); }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="create-visit-reminder-form">
      <div className="form-field">
        <label htmlFor="hours-before">Hours before the visit</label>
        <input id="hours-before" type="number" min={1} max={168} value={hoursBefore}
          onChange={e => setHoursBefore(parseInt(e.target.value) || 24)} disabled={pending} style={{ width: 100 }} />
        <span className="hint" style={{ marginLeft: "var(--space-2)" }}>hours (default: 24)</span>
      </div>
      {error && <p className="error-inline" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}
        data-testid="submit-create-visit-reminder">
        {pending ? "Creating…" : "Enable Visit Reminders"}
      </button>
    </form>
  );
}

function CreateInvoiceFollowupForm() {
  const [daysInput, setDaysInput] = useState("7, 14, 30");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const days = daysInput.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (days.length === 0) { setError("Enter at least one day threshold"); return; }
    setPending(true);
    try {
      const res = await fetch("/api/v1/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invoice_followup", config: { days_overdue: days } }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to create automation");
        return;
      }
      window.location.reload();
    } catch { setError("Unexpected error"); } finally { setPending(false); }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="create-invoice-followup-form">
      <div className="form-field">
        <label htmlFor="days-overdue">Follow up when overdue by (days)</label>
        <input id="days-overdue" type="text" value={daysInput}
          onChange={e => setDaysInput(e.target.value)} disabled={pending} placeholder="7, 14, 30" style={{ width: 160 }} />
        <span className="hint" style={{ marginLeft: "var(--space-2)" }}>comma-separated</span>
      </div>
      {error && <p className="error-inline" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}
        data-testid="submit-create-invoice-followup">
        {pending ? "Creating…" : "Enable Invoice Follow-ups"}
      </button>
    </form>
  );
}

function CreateBookingConfirmedForm() {
  const [hoursWindow, setHoursWindow] = useState(48);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/v1/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "booking_confirmed", config: { hours_window: hoursWindow } }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to create automation");
        return;
      }
      window.location.reload();
    } catch { setError("Unexpected error"); } finally { setPending(false); }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="create-booking-confirmed-form">
      <div className="form-field">
        <label htmlFor="hours-window">Look back window (hours)</label>
        <input id="hours-window" type="number" min={1} max={168} value={hoursWindow}
          onChange={e => setHoursWindow(parseInt(e.target.value) || 48)} disabled={pending} style={{ width: 100 }} />
        <span className="hint" style={{ marginLeft: "var(--space-2)" }}>hours since visit was created (default: 48)</span>
      </div>
      {error && <p className="error-inline" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}
        data-testid="submit-create-booking-confirmed">
        {pending ? "Creating…" : "Enable Booking Confirmations"}
      </button>
    </form>
  );
}

function CreateReviewRequestForm() {
  const [daysAfter, setDaysAfter] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/v1/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "review_request", config: { days_after: daysAfter } }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to create automation");
        return;
      }
      window.location.reload();
    } catch { setError("Unexpected error"); } finally { setPending(false); }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="create-review-request-form">
      <div className="form-field">
        <label htmlFor="days-after">Send review request this many days after job completion</label>
        <input id="days-after" type="number" min={1} max={30} value={daysAfter}
          onChange={e => setDaysAfter(parseInt(e.target.value) || 1)} disabled={pending} style={{ width: 80 }} />
        <span className="hint" style={{ marginLeft: "var(--space-2)" }}>days (default: 1)</span>
      </div>
      {error && <p className="error-inline" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}
        data-testid="submit-create-review-request">
        {pending ? "Creating…" : "Enable Review Requests"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// AutomationSection — reusable wrapper for each automation type
// ---------------------------------------------------------------------------

function AutomationSection({
  title,
  description,
  automation,
  stats,
  createForm,
  onRun,
  isRunning,
  isAdmin,
  testId,
}: {
  title: string;
  description: string;
  automation: AutomationRow | null;
  stats: EventStats;
  createForm: React.ReactNode;
  onRun: () => void;
  isRunning: boolean;
  isAdmin: boolean;
  testId: string;
}) {
  return (
    <section className="automation-section" data-testid={testId}>
      <h2 className="section-title">
        {title}
        {automation && !automation.enabled && (
          <span className="status-badge status-disabled">Disabled</span>
        )}
      </h2>
      <p className="section-desc">{description}</p>
      {automation ? (
        <AutomationCard
          automation={automation}
          stats={stats}
          onRun={onRun}
          isRunning={isRunning}
          canRun={isAdmin && automation.enabled}
          isAdmin={isAdmin}
        />
      ) : (
        <div className="empty-card">
          <p>Not configured yet.</p>
          {isAdmin && createForm}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AutomationsClient({
  visitReminder,
  invoiceFollowup,
  bookingConfirmed,
  reviewRequest,
  visitReminderStats,
  invoiceFollowupStats,
  bookingConfirmedStats,
  reviewRequestStats,
  recentEvents,
  isAdmin,
}: Props) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleRun(automationId: string, label: string) {
    if (!isAdmin) return;
    setRunningId(automationId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/v1/automations/${automationId}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to trigger automation");
      } else {
        setSuccess(data.data?.message ?? `${label} triggered`);
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch { setError("Network error"); } finally { setRunningId(null); }
  }

  const runHandler = (a: AutomationRow | null, label: string) =>
    a ? () => handleRun(a.id, label) : () => {};

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Automations</h1>
          <p className="page-subtitle">Manage automated client communications</p>
        </div>
      </div>

      {error && <div className="alert alert-error" data-testid="automation-error">{error}</div>}
      {success && <div className="alert alert-success" data-testid="automation-success">{success}</div>}

      <div className="automations-grid">
        <AutomationSection
          title="Booking Confirmations"
          description="Automatically send a confirmation email when a new visit is scheduled."
          automation={bookingConfirmed}
          stats={bookingConfirmedStats}
          createForm={<CreateBookingConfirmedForm />}
          onRun={runHandler(bookingConfirmed, "Booking confirmation")}
          isRunning={runningId === bookingConfirmed?.id}
          isAdmin={isAdmin}
          testId="booking-confirmed-section"
        />

        <AutomationSection
          title="Visit Reminders"
          description="Automatically send a reminder before scheduled visits."
          automation={visitReminder}
          stats={visitReminderStats}
          createForm={<CreateVisitReminderForm />}
          onRun={runHandler(visitReminder, "Visit reminder")}
          isRunning={runningId === visitReminder?.id}
          isAdmin={isAdmin}
          testId="visit-reminders-section"
        />

        <AutomationSection
          title="Review Requests"
          description="Automatically ask clients for a review after a job is completed."
          automation={reviewRequest}
          stats={reviewRequestStats}
          createForm={<CreateReviewRequestForm />}
          onRun={runHandler(reviewRequest, "Review request")}
          isRunning={runningId === reviewRequest?.id}
          isAdmin={isAdmin}
          testId="review-request-section"
        />

        <AutomationSection
          title="Overdue Invoice Follow-ups"
          description="Automatically follow up on overdue invoices at configured intervals."
          automation={invoiceFollowup}
          stats={invoiceFollowupStats}
          createForm={<CreateInvoiceFollowupForm />}
          onRun={runHandler(invoiceFollowup, "Invoice follow-up")}
          isRunning={runningId === invoiceFollowup?.id}
          isAdmin={isAdmin}
          testId="invoice-followups-section"
        />
      </div>

      <section className="events-section" data-testid="recent-events-section">
        <h2 className="section-title">Recent Automation Events</h2>
        {recentEvents.length === 0 ? (
          <div className="empty-card">
            <p>No automation events yet.</p>
            <p className="hint">Events will appear here when automations run.</p>
          </div>
        ) : (
          <div className="events-list">
            {recentEvents.map((event) => (
              <div key={event.id} className="event-item" data-testid="event-item">
                <div className="event-icon">{eventIcon(event.entity_type)}</div>
                <div className="event-content">
                  <p className="event-summary">{summarizeEvent(event)}</p>
                  <p className="event-time">{formatDate(event.created_at)}</p>
                </div>
                <span className={`event-type-badge type-${event.entity_type}`}>
                  {eventLabel(event.entity_type)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {!isAdmin && (
        <p className="role-notice">You have limited view access. Run controls are available to admins only.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AutomationCard
// ---------------------------------------------------------------------------

function AutomationCard({
  automation,
  stats,
  onRun,
  isRunning,
  canRun,
  isAdmin,
}: {
  automation: AutomationRow;
  stats: EventStats;
  onRun: () => void;
  isRunning: boolean;
  canRun: boolean;
  isAdmin: boolean;
}) {
  const [enabled, setEnabled] = useState(automation.enabled);
  const [toggling, setToggling] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);

  async function handleToggle() {
    if (!isAdmin || toggling) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/v1/automations/${automation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) setEnabled(e => !e);
    } finally { setToggling(false); }
  }

  async function handleConfigUpdate(newConfig: Record<string, unknown>) {
    const res = await fetch(`/api/v1/automations/${automation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: newConfig }),
    });
    if (res.ok) { setEditingConfig(false); window.location.reload(); }
  }

  const hoursBefore  = (automation.config?.hours_before as number | undefined) ?? 24;
  const hoursWindow  = (automation.config?.hours_window as number | undefined) ?? 48;
  const daysAfter    = (automation.config?.days_after as number | undefined) ?? 1;
  const daysOverdue  = (automation.config?.days_overdue as number[] | undefined) ?? [7, 14, 30];

  return (
    <div className="automation-card">
      {isAdmin && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <button type="button" className={`btn btn-sm ${enabled ? "btn-danger" : "btn-primary"}`}
            onClick={handleToggle} disabled={toggling} data-testid={`toggle-${automation.type}`}>
            {toggling ? "…" : enabled ? "Disable" : "Enable"}
          </button>
          {!editingConfig && (
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => setEditingConfig(true)} data-testid={`edit-config-${automation.type}`}>
              Edit config
            </button>
          )}
          <span style={{ fontSize: "var(--text-sm)", color: enabled ? "var(--status-success, green)" : "var(--fg-muted)" }}>
            {enabled ? "Active" : "Disabled"}
          </span>
        </div>
      )}

      {editingConfig && isAdmin && (
        <div style={{ marginBottom: "var(--space-3)", padding: "var(--space-3)", background: "var(--bg-subtle)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          {automation.type === "visit_reminder" && (
            <EditVisitReminderConfig initialHours={hoursBefore} onSave={handleConfigUpdate} onCancel={() => setEditingConfig(false)} />
          )}
          {automation.type === "invoice_followup" && (
            <EditInvoiceFollowupConfig initialDays={daysOverdue} onSave={handleConfigUpdate} onCancel={() => setEditingConfig(false)} />
          )}
          {automation.type === "booking_confirmed" && (
            <EditNumberConfig label="Look back window (hours)" field="hours_window" initial={hoursWindow}
              min={1} max={168} onSave={handleConfigUpdate} onCancel={() => setEditingConfig(false)} />
          )}
          {automation.type === "review_request" && (
            <EditNumberConfig label="Days after job completion" field="days_after" initial={daysAfter}
              min={1} max={30} onSave={handleConfigUpdate} onCancel={() => setEditingConfig(false)} />
          )}
        </div>
      )}

      <div className="automation-stats">
        <div className="stat-group">
          <h4>Last 24 hours</h4>
          <div className="stat-row"><span className="stat-label">Sent:</span><span className="stat-value" data-testid="stat-24h-sent">{stats.last_24h.sent}</span></div>
          <div className="stat-row"><span className="stat-label">Errors:</span><span className="stat-value" data-testid="stat-24h-errors">{stats.last_24h.errors}</span></div>
        </div>
        <div className="stat-group">
          <h4>Last 7 days</h4>
          <div className="stat-row"><span className="stat-label">Sent:</span><span className="stat-value" data-testid="stat-7d-sent">{stats.last_7d.sent}</span></div>
          <div className="stat-row"><span className="stat-label">Errors:</span><span className="stat-value" data-testid="stat-7d-errors">{stats.last_7d.errors}</span></div>
        </div>
      </div>

      <div className="automation-meta">
        <div className="meta-row"><span className="meta-label">Last run:</span><span className="meta-value">{formatDate(automation.last_run_at)}</span></div>
        <div className="meta-row"><span className="meta-label">Next run:</span><span className="meta-value">{formatDate(automation.next_run_at)}</span></div>
        {automation.type === "visit_reminder" && (
          <div className="meta-row"><span className="meta-label">Hours before visit:</span><span className="meta-value">{hoursBefore}</span></div>
        )}
        {automation.type === "invoice_followup" && (
          <div className="meta-row"><span className="meta-label">Follow-up days:</span><span className="meta-value">{Array.isArray(daysOverdue) ? daysOverdue.join(", ") : "7, 14, 30"}</span></div>
        )}
        {automation.type === "booking_confirmed" && (
          <div className="meta-row"><span className="meta-label">Look back window:</span><span className="meta-value">{hoursWindow}h</span></div>
        )}
        {automation.type === "review_request" && (
          <div className="meta-row"><span className="meta-label">Days after completion:</span><span className="meta-value">{daysAfter}</span></div>
        )}
      </div>

      {canRun && enabled && (
        <button className="btn btn-primary run-btn" onClick={onRun} disabled={isRunning}
          data-testid={`run-${automation.type}`}>
          {isRunning ? "Running…" : "Run now"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit config forms
// ---------------------------------------------------------------------------

function EditVisitReminderConfig({ initialHours, onSave, onCancel }: { initialHours: number; onSave: (c: Record<string, unknown>) => void; onCancel: () => void }) {
  const [hours, setHours] = useState(initialHours);
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 600 }}>Edit Visit Reminder Config</p>
      <div className="form-field">
        <label htmlFor="edit-hours-before">Hours before visit</label>
        <input id="edit-hours-before" type="number" min={1} max={168} value={hours}
          onChange={e => setHours(parseInt(e.target.value) || 24)} disabled={saving} style={{ width: 100 }} />
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        <button type="button" className="btn btn-primary btn-sm"
          onClick={() => { setSaving(true); onSave({ hours_before: hours }); }} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

function EditInvoiceFollowupConfig({ initialDays, onSave, onCancel }: { initialDays: number[]; onSave: (c: Record<string, unknown>) => void; onCancel: () => void }) {
  const [daysInput, setDaysInput] = useState(initialDays.join(", "));
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 600 }}>Edit Invoice Follow-up Config</p>
      <div className="form-field">
        <label htmlFor="edit-days-overdue">Overdue days (comma-separated)</label>
        <input id="edit-days-overdue" type="text" value={daysInput}
          onChange={e => setDaysInput(e.target.value)} disabled={saving} placeholder="7, 14, 30" style={{ width: 160 }} />
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        <button type="button" className="btn btn-primary btn-sm"
          onClick={() => {
            const days = daysInput.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
            if (!days.length) return;
            setSaving(true); onSave({ days_overdue: days });
          }} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

function EditNumberConfig({ label, field, initial, min, max, onSave, onCancel }: {
  label: string; field: string; initial: number; min: number; max: number;
  onSave: (c: Record<string, unknown>) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 600 }}>Edit Config</p>
      <div className="form-field">
        <label>{label}</label>
        <input type="number" min={min} max={max} value={value}
          onChange={e => setValue(parseInt(e.target.value) || initial)} disabled={saving} style={{ width: 100 }} />
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        <button type="button" className="btn btn-primary btn-sm"
          onClick={() => { setSaving(true); onSave({ [field]: value }); }} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}
