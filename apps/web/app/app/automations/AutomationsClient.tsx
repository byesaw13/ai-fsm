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
    } catch (err) {
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
              {isAdmin && <p className="hint">Create one via the API or database.</p>}
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
              {isAdmin && <p className="hint">Create one via the API or database.</p>}
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
