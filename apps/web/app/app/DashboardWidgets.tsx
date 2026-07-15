"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, LinkButton, SectionHeader, StatusBadge, useToast } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";

export type CountAction = {
  label: string;
  count: number;
  href: Route;
  detail: string;
  tone: "danger" | "warning" | "default";
};

export type CommandVisit = {
  id: string;
  title: string;
  status: string;
  client_name: string | null;
  property_address: string | null;
  visit_id: string | null;
  scheduled_start: string | null;
  visit_status: string | null;
  sub_status: string | null;
};

export type MaterialJob = {
  id: string;
  job_id: string;
  title: string;
  client_name: string | null;
};

function fmtTime(iso: string | null): string {
  if (!iso) return "Today";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function accentForTone(tone: CountAction["tone"]): string {
  if (tone === "danger") return "var(--color-danger)";
  if (tone === "warning") return "var(--color-warning)";
  return "var(--accent)";
}

export function ActionQueue({ items }: { items: CountAction[] }) {
  return (
    <Card>
      <SectionHeader title="What needs you" count={items.length} />
      {items.length === 0 ? (
        <EmptyState title="Nothing is waiting" description="Follow-ups, deposits, and invoices show up here when they need action." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {items.map((item) => {
            const accent = accentForTone(item.tone);
            return (
              <Link key={item.label} href={item.href} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", padding: "var(--space-3)", borderRadius: "var(--radius)", border: `1px solid ${accent}`, textDecoration: "none", color: "inherit", background: "var(--bg-card)" }}>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <strong>{item.label}</strong>
                  <small style={{ color: "var(--fg-muted)" }}>{item.detail}</small>
                </span>
                <b style={{ minWidth: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 8px", borderRadius: 99, background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}>{item.count}</b>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function JobsToday({ jobs, readOnly = false }: { jobs: CommandVisit[]; readOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [guardedVisit, setGuardedVisit] = useState<string | null>(null);

  async function transition(visitId: string, status: "arrived" | "completed") {
    setPending(visitId);
    setGuardedVisit(null);
    const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(null);
    if (!res.ok) {
      if (status === "completed" && ["MISSING_PHOTO", "MISSING_SIGNATURE"].includes(json.error?.code)) {
        setGuardedVisit(visitId);
        return;
      }
      toast.error(json.error?.message ?? "Could not update visit");
      return;
    }
    toast.success(status === "completed" ? "Visit completed" : "Arrived on site");
    router.refresh();
  }

  async function markNeedsFollowUp(visitId: string) {
    setPending(visitId);
    const res = await fetch(`/api/v1/visits/${visitId}/sub-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sub_status: "reschedule_requested" }),
    });
    setPending(null);
    if (!res.ok) {
      toast.error("Could not mark visit for follow-up");
      return;
    }
    toast.success("Visit marked for reschedule");
    router.refresh();
  }

  return (
    <Card>
      <SectionHeader title="Today's Projects" count={jobs.length} action={<LinkButton href="/app/jobs" variant="ghost" size="sm">View all</LinkButton>} />
      {jobs.length === 0 ? <EmptyState title="No projects scheduled today" description="Scheduled visits for today appear here." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {jobs.map((job) => {
            const visitId = job.visit_id;
            const canArrive = visitId && job.visit_status === "scheduled";
            const canComplete = visitId && (job.visit_status === "arrived" || job.visit_status === "in_progress");
            return (
              <div key={job.id} style={{ padding: "var(--space-3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <Link href={(visitId ? `/app/visits/${visitId}` : `/app/jobs/${job.id}`) as Route} style={{ color: "inherit", textDecoration: "none", fontWeight: 700 }}>{job.title}</Link>
                    <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 4 }}>{fmtTime(job.scheduled_start)} · {job.client_name ?? "Client"}{job.property_address ? ` · ${job.property_address}` : ""}</div>
                  </div>
                  <StatusBadge variant={(job.visit_status ?? job.status) as StatusVariant}>{(job.visit_status ?? job.status).replaceAll("_", " ")}</StatusBadge>
                </div>
                {!readOnly && (canArrive || canComplete) && (
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                    {canArrive && <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" disabled={pending === visitId} onClick={() => transition(visitId, "arrived")}>{pending === visitId ? "Updating..." : "Arrive"}</button>}
                    {canComplete && <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" disabled={pending === visitId} onClick={() => transition(visitId, "completed")}>{pending === visitId ? "Updating..." : "Complete"}</button>}
                  </div>
                )}
                {!readOnly && visitId && guardedVisit === visitId && (
                  <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-warning)", background: "#fffbeb", color: "#92400e" }}>
                    <strong>Need a photo/signature before closing.</strong>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
                      <Link className="p7-btn p7-btn-secondary p7-btn-sm" href={`/app/visits/${visitId}#visit-completion` as Route}>Open checklist</Link>
                      <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" disabled={pending === visitId} onClick={() => markNeedsFollowUp(visitId)}>Mark incomplete / needs follow-up</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function Materials({ count, jobs }: { count: number; jobs: MaterialJob[] }) {
  return (
    <Card data-testid="dashboard-materials">
      <SectionHeader
        title="Materials to order"
        count={count}
        action={
          <LinkButton href="/app/expenses/new?mode=run" variant="primary" size="sm">
            Material Run
          </LinkButton>
        }
      />
      {jobs.length === 0 ? (
        <EmptyState
          title="Nothing to stage"
          description="When an estimate is approved on an active project, its shopping list shows up here."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {jobs.map((job) => (
            <div
              key={job.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
              }}
            >
              <span>
                <strong>{job.title}</strong>
                {job.client_name ? (
                  <small style={{ color: "var(--fg-muted)", marginLeft: 8 }}>{job.client_name}</small>
                ) : null}
              </span>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <LinkButton
                  href={`/app/estimates/${job.id}/shopping-list` as Route}
                  variant="primary"
                  size="sm"
                >
                  Shopping List →
                </LinkButton>
                <LinkButton
                  href={`/app/expenses/new?mode=run&job=${job.job_id}` as Route}
                  variant="secondary"
                  size="sm"
                >
                  Log run
                </LinkButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
