"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader, useToast } from "@/components/ui";
import type { VisitStatus } from "@ai-fsm/domain";

interface VisitCardData {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string | null;
  job_title: string | null;
  property_address: string | null;
  client_name: string | null;
  job_type: string | null;
  job_description: string | null;
  assigned_user_name: string | null;
}

interface MyDayViewProps {
  visits: VisitCardData[];
  completedVisits: VisitCardData[];
  upcomingVisits: VisitCardData[];
  pastOverdueVisits: VisitCardData[];
  role: string;
  now: string;
  statusLabels: Record<string, string>;
  /** When set, this visit is shown in the hero — skip "Next" badge on list cards. */
  heroVisitId?: string | null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isOverdue(visit: VisitCardData, nowMs = Date.now()): boolean {
  return new Date(visit.scheduled_start).getTime() < nowMs && visit.status === "scheduled";
}

function statusColor(status: string): string {
  switch (status) {
    case "in_progress": return "var(--color-primary)";
    case "arrived": return "var(--color-warning)";
    case "scheduled": return "var(--fg-secondary)";
    case "completed": return "var(--color-success)";
    case "cancelled": return "var(--color-danger)";
    default: return "var(--fg-muted)";
  }
}

async function transitionVisit(visitId: string, targetStatus: string, toast: ReturnType<typeof useToast>) {
  try {
    const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetStatus }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error?.message ?? "Could not update status");
      return false;
    }
    const labels: Record<string, string> = {
      arrived: "Job started — on site",
      in_progress: "Job started — on site",
      completed: "Visit completed",
      cancelled: "Visit cancelled",
    };
    toast.success(labels[targetStatus] ?? "Status updated");
    return true;
  } catch {
    toast.error("Unexpected error");
    return false;
  }
}

function VisitCard({
  visit,
  isNext,
  role,
  onTransition,
  transitioning,
}: {
  visit: VisitCardData;
  isNext: boolean;
  role: string;
  onTransition: (visitId: string, targetStatus: string) => void;
  transitioning: string | null;
}) {
  const overdue = isOverdue(visit);
  const isFieldRole = role === "tech" || role === "owner";
  const canStart = isFieldRole && visit.status === "scheduled";
  const canComplete = isFieldRole && (visit.status === "arrived" || visit.status === "in_progress");

  return (
    <Card
      padding="sm"
      style={{
        border: isNext
          ? `2px solid ${statusColor(visit.status)}`
          : `1px solid var(--color-border)`,
        background: isNext ? "var(--color-surface-overlay)" : undefined,
        position: "relative",
      }}
    >
      {isNext && (
        <div
          style={{
            position: "absolute",
            top: -10,
            left: "var(--space-3)",
            background: statusColor(visit.status),
            color: "#fff",
            padding: "2px 12px",
            borderRadius: 99,
            fontSize: "var(--text-xs)",
            fontWeight: 600,
          }}
        >
          {overdue ? "Overdue" : visit.status === "scheduled" ? "Next" : "Active"}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-2)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>
              {visit.job_title ?? "Untitled job"}
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 99,
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                color: statusColor(visit.status),
                background: `${statusColor(visit.status)}18`,
              }}
            >
              {visit.status === "in_progress" ? "In Progress" : visit.status === "arrived" ? "Arrived" : visit.status === "scheduled" ? "Scheduled" : visit.status}
            </span>
          </div>
          {visit.property_address && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: "4px 0 0" }}>
              {visit.property_address}
            </p>
          )}
          {visit.client_name && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: "2px 0 0" }}>
              {visit.client_name}
            </p>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
            {formatTime(visit.scheduled_start)}
          </div>
          {overdue && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", fontWeight: 500 }}>
              Overdue
            </div>
          )}
        </div>
      </div>

      {visit.job_description && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)", margin: "var(--space-2) 0", padding: "var(--space-2)", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)" }}>
          {visit.job_description}
        </p>
      )}

      {/* Action buttons — field roles (tech + owner) */}
      {isFieldRole && (
        <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {/* Primary action: Start or Complete */}
          {(canStart || canComplete) && (
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {canStart && (
                <button
                  onClick={() => onTransition(visit.id, "arrived")}
                  disabled={transitioning === visit.id}
                  style={{
                    flex: 1,
                    padding: "var(--space-3)",
                    background: "var(--color-primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-base)",
                    fontWeight: 600,
                    cursor: transitioning === visit.id ? "wait" : "pointer",
                    opacity: transitioning === visit.id ? 0.7 : 1,
                  }}
                >
                  {transitioning === visit.id ? "Starting…" : "Start Job"}
                </button>
              )}
              {canComplete && (
                <button
                  onClick={() => onTransition(visit.id, "completed")}
                  disabled={transitioning === visit.id}
                  style={{
                    flex: 1,
                    padding: "var(--space-3)",
                    background: "transparent",
                    color: "var(--color-success)",
                    border: `2px solid var(--color-success)`,
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-base)",
                    fontWeight: 600,
                    cursor: transitioning === visit.id ? "wait" : "pointer",
                    opacity: transitioning === visit.id ? 0.7 : 1,
                  }}
                >
                  {transitioning === visit.id ? "Completing…" : "Complete Job"}
                </button>
              )}
            </div>
          )}

          {/* Work tools — shown when arrived or in_progress */}
          {(visit.status === "arrived" || visit.status === "in_progress") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-2)" }}>
              <Link href={`/app/visits/${visit.id}` as Route}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  padding: "var(--space-3) var(--space-1)",
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  color: "var(--fg-primary)",
                  textDecoration: "none",
                }}
              >
                <span style={{ fontSize: "var(--text-lg)" }}>📸</span>
                Photos
              </Link>
              <Link href={`/app/visits/${visit.id}` as Route}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  padding: "var(--space-3) var(--space-1)",
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  color: "var(--fg-primary)",
                  textDecoration: "none",
                }}
              >
                <span style={{ fontSize: "var(--text-lg)" }}>✅</span>
                Checklist
              </Link>
              <Link href={`/app/visits/${visit.id}` as Route}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  padding: "var(--space-3) var(--space-1)",
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  color: "var(--fg-primary)",
                  textDecoration: "none",
                }}
              >
                <span style={{ fontSize: "var(--text-lg)" }}>🔩</span>
                Parts
              </Link>
              <Link href={`/app/visits/${visit.id}` as Route}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  padding: "var(--space-3) var(--space-1)",
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  color: "var(--fg-primary)",
                  textDecoration: "none",
                }}
              >
                <span style={{ fontSize: "var(--text-lg)" }}>📝</span>
                Notes
              </Link>
            </div>
          )}
        </div>
      )}


    </Card>
  );
}

export function MyDayView({
  visits,
  completedVisits,
  upcomingVisits,
  pastOverdueVisits,
  role,
  now,
  heroVisitId = null,
}: MyDayViewProps) {
  const router = useRouter();
  const toast = useToast();
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const nowMs = new Date(now).getTime();

  // Sort: overdue first, then by scheduled_start
  const sortedVisits = [...visits].sort((a, b) => {
    const aOverdue = isOverdue(a, nowMs) ? 1 : 0;
    const bOverdue = isOverdue(b, nowMs) ? 1 : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;
    return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
  });

  // Determine the "next" visit
  const activeVisit = sortedVisits.find(
    (v) => v.status === "in_progress" || v.status === "arrived"
  );
  const nextScheduled = sortedVisits.find(
    (v) => v.status === "scheduled" && !isOverdue(v, nowMs)
  );
  const overdueVisit = sortedVisits.find((v) => isOverdue(v, nowMs));
  const nextId = heroVisitId
    ? null
    : activeVisit?.id ?? overdueVisit?.id ?? nextScheduled?.id ?? null;

  async function handleTransition(visitId: string, targetStatus: string) {
    setTransitioning(visitId);
    const success = await transitionVisit(visitId, targetStatus, toast);
    if (success) {
      router.refresh();
    }
    setTransitioning(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Past-day overdue visits — these are from previous days and were never completed */}
      {pastOverdueVisits.length > 0 && (
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: "var(--radius)",
          }}
        >
          <p style={{ margin: "0 0 var(--space-2)", fontWeight: 700, color: "#92400e" }}>
            {pastOverdueVisits.length === 1
              ? "1 visit is overdue — open it to reschedule before the customer follows up."
              : `${pastOverdueVisits.length} visits are overdue — reschedule them before customers follow up.`}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {pastOverdueVisits.map((v) => {
              const daysPast = Math.floor(
                (Date.now() - new Date(v.scheduled_start).getTime()) / (1000 * 60 * 60 * 24)
              );
              const overdueLabel =
                daysPast < 1 ? "less than a day overdue" :
                daysPast === 1 ? "1 day overdue" :
                daysPast < 30 ? `${daysPast} days overdue` :
                `${Math.floor(daysPast / 30)} month${Math.floor(daysPast / 30) !== 1 ? "s" : ""} overdue`;
              return (
                <div
                  key={v.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: "var(--text-sm)", color: "#92400e" }}>
                    <span style={{ fontWeight: 600 }}>
                      {v.job_title ?? "Visit"}
                      {v.client_name ? ` — ${v.client_name}` : ""}
                    </span>
                    <span style={{ marginLeft: "var(--space-2)", opacity: 0.8 }}>
                      {overdueLabel}
                    </span>
                  </div>
                  <Link
                    href={`/app/visits/${v.id}` as Route}
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      color: "#92400e",
                      textDecoration: "underline",
                      whiteSpace: "nowrap",
                    }}
                  >
                    View &amp; Reschedule →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active / Next visits */}
      {sortedVisits.length > 0 && (
        <>
          {sortedVisits.map((visit) => (
            <div key={visit.id} style={{ opacity: transitioning === visit.id ? 0.6 : 1 }}>
              <VisitCard
                visit={visit}
                isNext={visit.id === nextId}
                role={role}
                onTransition={handleTransition}
                transitioning={transitioning}
              />
            </div>
          ))}
        </>
      )}

      {/* Completed today */}
      {completedVisits.length > 0 && (
        <div>
          <SectionHeader title={`Completed — ${completedVisits.length}`} as="h3" />
          {completedVisits.map((visit) => (
            <div key={visit.id} style={{ marginBottom: "var(--space-2)", opacity: 0.7 }}>
              <VisitCard
                visit={visit}
                isNext={false}
                role={role}
                onTransition={handleTransition}
                transitioning={transitioning}
              />
            </div>
          ))}
        </div>
      )}

      {/* Upcoming days */}
      {upcomingVisits.length > 0 && (
        <div>
          <SectionHeader title={`Upcoming — ${upcomingVisits.length}`} as="h3" />
          {upcomingVisits.slice(0, 5).map((visit) => (
            <div key={visit.id} style={{ marginBottom: "var(--space-2)", opacity: 0.8 }}>
              <VisitCard
                visit={visit}
                isNext={false}
                role={role}
                onTransition={handleTransition}
                transitioning={transitioning}
              />
            </div>
          ))}
          {upcomingVisits.length > 5 && (
            <Link href={"/app/visits" as Route} style={{ fontSize: "var(--text-sm)", color: "var(--color-primary)" }}>
              +{upcomingVisits.length - 5} more →
            </Link>
          )}
        </div>
      )}

      {sortedVisits.length === 0 && completedVisits.length === 0 && !heroVisitId && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", textAlign: "center", padding: "var(--space-6) 0" }}>
          No visits today. Enjoy the free time!
        </p>
      )}
    </div>
  );
}
