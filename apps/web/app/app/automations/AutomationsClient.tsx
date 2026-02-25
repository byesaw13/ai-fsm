"use client";

import { useState } from "react";

interface AutomationRow {
  id: string;
  type: "visit_reminder" | "invoice_followup";
  enabled: boolean;
  config: Record<string, unknown>;
  next_run_at: string | null;
  last_run_at: string | null;
}

interface EventStats {
  last_24h: { sent: number; skipped: number; errors: number };
  last_7d: { sent: number; skipped: number; errors: number };
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
  visitReminderStats: EventStats;
  invoiceFollowupStats: EventStats;
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
    const clientName = val.client_name ?? "Unknown client";
    const jobTitle = val.job_title ?? "visit";
    return `Reminder sent to ${clientName} for "${jobTitle}"`;
  }

  if (event.entity_type === "invoice_followup") {
    const invoiceNum = val.invoice_number ?? "Unknown";
    const clientName = val.client_name ?? "";
    const step = val.days_overdue_step ?? "?";
    return `Follow-up (day ${step}) sent for invoice #${invoiceNum}${clientName ? ` - ${clientName}` : ""}`;
  }

  return `${event.entity_type} event`;
}

// ---------------------------------------------------------------------------
// CreateAutomationForm — inline form for creating a new automation
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
        body: JSON.stringify({
          type: "visit_reminder",
          config: { hours_before: hoursBefore },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to create automation");
        return;
      }
      window.location.reload();
    } catch {
      setError("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="create-visit-reminder-form">
      <div className="form-field">
        <label htmlFor="hours-before">
          Send reminder this many hours before the visit
        </label>
        <input
          id="hours-before"
          type="number"
          min={1}
          max={168}
          value={hoursBefore}
          onChange={e => setHoursBefore(parseInt(e.target.value) || 24)}
          disabled={pending}
          style={{ width: 100 }}
        />
        <span className="hint" style={{ marginLeft: "var(--space-2)" }}>hours (default: 24)</span>
      </div>
      {error && <p className="error-inline" role="alert">{error}</p>}
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={pending}
        data-testid="submit-create-visit-reminder"
      >
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

    const days = daysInput
      .split(",")
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n > 0);

    if (days.length === 0) {
      setError("Enter at least one day threshold (e.g., 7, 14, 30)");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/v1/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "invoice_followup",
          config: { days_overdue: days },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to create automation");
        return;
      }
      window.location.reload();
    } catch {
      setError("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="create-invoice-followup-form">
      <div className="form-field">
        <label htmlFor="days-overdue">
          Follow up when invoices are overdue by (days)
        </label>
        <input
          id="days-overdue"
          type="text"
          value={daysInput}
          onChange={e => setDaysInput(e.target.value)}
          disabled={pending}
          placeholder="7, 14, 30"
          style={{ width: 160 }}
        />
        <span className="hint" style={{ marginLeft: "var(--space-2)" }}>comma-separated</span>
      </div>
      {error && <p className="error-inline" role="alert">{error}</p>}
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={pending}
        data-testid="submit-create-invoice-followup"
      >
        {pending ? "Creating…" : "Enable Invoice Follow-ups"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AutomationsClient({
  visitReminder,
  invoiceFollowup,
  visitReminderStats,
  invoiceFollowupStats,
  recentEvents,
  isAdmin,
}: Props) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleRun(automationId: string, type: string) {
    if (!isAdmin) return;

    setRunningId(automationId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/v1/automations/${automationId}/run`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Failed to trigger automation");
      } else {
        setSuccess(data.data?.message ?? `${type} triggered successfully`);
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      setError("Network error");
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Automations</h1>
          <p className="page-subtitle">
            Manage automated reminders and follow-ups
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" data-testid="automation-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" data-testid="automation-success">
          {success}
        </div>
      )}

      <div className="automations-grid">
        <section className="automation-section" data-testid="visit-reminders-section">
          <h2 className="section-title">
            Visit Reminders
            {visitReminder && !visitReminder.enabled && (
              <span className="status-badge status-disabled">Disabled</span>
            )}
          </h2>
          <p className="section-desc">
            Automatically send reminders before scheduled visits.
          </p>

          {visitReminder ? (
            <AutomationCard
              automation={visitReminder}
              stats={visitReminderStats}
              onRun={() => handleRun(visitReminder.id, "Visit reminder")}
              isRunning={runningId === visitReminder.id}
              canRun={isAdmin && visitReminder.enabled}
            />
          ) : (
            <div className="empty-card">
              <p>No visit reminder automation configured.</p>
              {isAdmin && <CreateVisitReminderForm />}
            </div>
          )}
        </section>

        <section className="automation-section" data-testid="invoice-followups-section">
          <h2 className="section-title">
            Overdue Invoice Follow-ups
            {invoiceFollowup && !invoiceFollowup.enabled && (
              <span className="status-badge status-disabled">Disabled</span>
            )}
          </h2>
          <p className="section-desc">
            Automatically follow up on overdue invoices at configured intervals.
          </p>

          {invoiceFollowup ? (
            <AutomationCard
              automation={invoiceFollowup}
              stats={invoiceFollowupStats}
              onRun={() => handleRun(invoiceFollowup.id, "Invoice follow-up")}
              isRunning={runningId === invoiceFollowup.id}
              canRun={isAdmin && invoiceFollowup.enabled}
            />
          ) : (
            <div className="empty-card">
              <p>No invoice follow-up automation configured.</p>
              {isAdmin && <CreateInvoiceFollowupForm />}
            </div>
          )}
        </section>
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
                <div className="event-icon">
                  {event.entity_type === "visit_reminder" ? "🔔" : "📧"}
                </div>
                <div className="event-content">
                  <p className="event-summary">{summarizeEvent(event)}</p>
                  <p className="event-time">{formatDate(event.created_at)}</p>
                </div>
                <span className={`event-type-badge type-${event.entity_type}`}>
                  {event.entity_type === "visit_reminder" ? "Reminder" : "Follow-up"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {!isAdmin && (
        <p className="role-notice">
          You have limited view access. Run controls are available to admins only.
        </p>
      )}
    </div>
  );
}

function AutomationCard({
  automation,
  stats,
  onRun,
  isRunning,
  canRun,
}: {
  automation: AutomationRow;
  stats: EventStats;
  onRun: () => void;
  isRunning: boolean;
  canRun: boolean;
}) {
  const hoursBefore = (automation.config?.hours_before as number | undefined) ?? 24;
  const daysOverdue = (automation.config?.days_overdue as number[] | undefined) ?? [7, 14, 30];

  return (
    <div className="automation-card">
      <div className="automation-stats">
        <div className="stat-group">
          <h4>Last 24 hours</h4>
          <div className="stat-row">
            <span className="stat-label">Sent:</span>
            <span className="stat-value" data-testid="stat-24h-sent">
              {stats.last_24h.sent}
            </span>
          </div>
        </div>
        <div className="stat-group">
          <h4>Last 7 days</h4>
          <div className="stat-row">
            <span className="stat-label">Sent:</span>
            <span className="stat-value" data-testid="stat-7d-sent">
              {stats.last_7d.sent}
            </span>
          </div>
        </div>
      </div>

      <div className="automation-meta">
        <div className="meta-row">
          <span className="meta-label">Last run:</span>
          <span className="meta-value">{formatDate(automation.last_run_at)}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Next run:</span>
          <span className="meta-value">{formatDate(automation.next_run_at)}</span>
        </div>
        {automation.type === "visit_reminder" && (
          <div className="meta-row">
            <span className="meta-label">Hours before visit:</span>
            <span className="meta-value">{hoursBefore}</span>
          </div>
        )}
        {automation.type === "invoice_followup" && (
          <div className="meta-row">
            <span className="meta-label">Follow-up days:</span>
            <span className="meta-value">{Array.isArray(daysOverdue) ? daysOverdue.join(", ") : "7, 14, 30"}</span>
          </div>
        )}
      </div>

      {canRun && (
        <button
          className="btn btn-primary run-btn"
          onClick={onRun}
          disabled={isRunning}
          data-testid={`run-${automation.type}`}
        >
          {isRunning ? "Running..." : "Run now"}
        </button>
      )}
    </div>
  );
}
