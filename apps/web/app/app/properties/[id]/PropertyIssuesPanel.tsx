"use client";

import { useState } from "react";

export type IssueRow = {
  id: string;
  area: string;
  item_key: string;
  title: string;
  description: string | null;
  status: "open" | "monitoring" | "resolved" | "referred";
  severity: "minor" | "moderate" | "major" | "critical";
  occurrence_count: number;
  first_noted_at: string;
  last_noted_at: string;
  auto_detected: boolean;
};

const SEVERITY_COLOR: Record<IssueRow["severity"], { fg: string; bg: string }> = {
  minor:    { fg: "#6b7280", bg: "#f3f4f6" },
  moderate: { fg: "#d97706", bg: "#fef3c7" },
  major:    { fg: "#dc2626", bg: "#fee2e2" },
  critical: { fg: "#7f1d1d", bg: "#fecaca" },
};

const STATUS_COLOR: Record<IssueRow["status"], { fg: string; bg: string }> = {
  open:       { fg: "#dc2626", bg: "#fee2e2" },
  monitoring: { fg: "#d97706", bg: "#fef3c7" },
  resolved:   { fg: "#16a34a", bg: "#dcfce7" },
  referred:   { fg: "#6b7280", bg: "#f3f4f6" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function IssueCard({
  issue,
  propertyId,
  onStatusChange,
}: {
  issue: IssueRow;
  propertyId: string;
  onStatusChange: (issueId: string, status: IssueRow["status"]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const sev = SEVERITY_COLOR[issue.severity];
  const sta = STATUS_COLOR[issue.status];

  async function resolve() {
    setSaving(true);
    const res = await fetch(`/api/v1/properties/${propertyId}/issues/${issue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    setSaving(false);
    if (res.ok) onStatusChange(issue.id, "resolved");
  }

  async function setMonitoring() {
    setSaving(true);
    const res = await fetch(`/api/v1/properties/${propertyId}/issues/${issue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "monitoring" }),
    });
    setSaving(false);
    if (res.ok) onStatusChange(issue.id, "monitoring");
  }

  return (
    <div
      style={{
        padding: "var(--space-3)",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${issue.severity === "critical" ? "#fca5a5" : "var(--color-border)"}`,
        background: issue.severity === "critical" ? "#fff5f5" : "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
        <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", flex: 1 }}>{issue.title}</div>
        <div style={{ display: "flex", gap: "var(--space-1)", flexShrink: 0 }}>
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: sev.fg, background: sev.bg, padding: "1px 7px", borderRadius: 99 }}>
            {issue.severity}
          </span>
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: sta.fg, background: sta.bg, padding: "1px 7px", borderRadius: 99 }}>
            {issue.status}
          </span>
        </div>
      </div>

      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginBottom: "var(--space-2)" }}>
        {issue.area} · {issue.occurrence_count}× seen · last {formatDate(issue.last_noted_at)}
        {issue.auto_detected && " · auto-detected"}
      </div>

      {issue.description && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-secondary)", marginBottom: "var(--space-2)" }}>
          {issue.description}
        </div>
      )}

      {issue.status !== "resolved" && (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {issue.status === "open" && (
            <button
              onClick={setMonitoring}
              disabled={saving}
              style={{
                fontSize: "var(--text-xs)", padding: "2px 10px", borderRadius: 99,
                border: "1px solid var(--color-border)", background: "transparent",
                cursor: saving ? "not-allowed" : "pointer", color: "var(--fg-secondary)",
              }}
            >
              Monitor
            </button>
          )}
          <button
            onClick={resolve}
            disabled={saving}
            style={{
              fontSize: "var(--text-xs)", padding: "2px 10px", borderRadius: 99,
              border: "1px solid #16a34a", background: "transparent",
              cursor: saving ? "not-allowed" : "pointer", color: "#16a34a",
            }}
          >
            Resolve
          </button>
        </div>
      )}
    </div>
  );
}

export function PropertyIssuesPanel({
  issues: initialIssues,
  propertyId,
}: {
  issues: IssueRow[];
  propertyId: string;
}) {
  const [issues, setIssues] = useState(initialIssues);

  function handleStatusChange(issueId: string, status: IssueRow["status"]) {
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, status } : i))
    );
  }

  const active = issues.filter((i) => i.status !== "resolved");
  const resolved = issues.filter((i) => i.status === "resolved");

  if (issues.length === 0) {
    return (
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", padding: "var(--space-2) 0" }}>
        No recurring issues detected. Issues are auto-detected when the same problem appears on 2+ visits.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {active.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          propertyId={propertyId}
          onStatusChange={handleStatusChange}
        />
      ))}
      {resolved.length > 0 && (
        <details style={{ marginTop: "var(--space-1)" }}>
          <summary style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", cursor: "pointer", userSelect: "none" }}>
            {resolved.length} resolved
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            {resolved.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                propertyId={propertyId}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
