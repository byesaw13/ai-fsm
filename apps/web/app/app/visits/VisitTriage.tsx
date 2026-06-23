import type { ReactNode } from "react";
import type { VisitStatus } from "@ai-fsm/domain";
import { SUB_STATUS_LABELS } from "@ai-fsm/domain";
import {
  ItemCard,
  StatusSection,
  EmptyState,
  StatusBadge,
  MetricGrid,
} from "@/components/ui";
import type { StatusVariant, MetricCardData } from "@/components/ui";
import {
  formatOverdueLabel,
  formatVisitDateTime,
  isVisitOverdue,
} from "@/lib/visits/p7";
import {
  buildVisitTriage,
  VISIT_STATUS_LABELS,
  type TriageVisitRow,
} from "@/lib/visits/triage";
import { CancelVisitButton } from "./CancelVisitButton";

interface VisitCardProps {
  visit: TriageVisitRow;
  showTech?: boolean;
  showOverdue?: boolean;
}

/** A single visit rendered as a clickable card. Shared by the triage view and
 * the tech Visits list. */
export function VisitItemCard({
  visit,
  showTech = false,
  showOverdue = false,
}: VisitCardProps) {
  const overdue = isVisitOverdue(visit);
  const metaParts: ReactNode[] = [];

  metaParts.push(
    <span key="date" className="p7-item-meta-text">
      {formatVisitDateTime(visit.scheduled_start)}
    </span>
  );

  if (visit.property_address) {
    metaParts.push(
      <span key="addr" className="p7-item-meta-text">
        {visit.property_address}
      </span>
    );
  }

  if (showTech) {
    if (visit.assigned_user_name) {
      metaParts.push(
        <span key="tech" className="p7-item-meta-text">
          Tech: {visit.assigned_user_name}
        </span>
      );
    } else {
      metaParts.push(
        <span
          key="unassigned"
          className="p7-badge p7-badge-status-cancelled"
          data-testid="unassigned-badge"
        >
          Unassigned
        </span>
      );
    }
  }

  if (showOverdue && overdue) {
    metaParts.push(
      <span key="overdue" className="p7-badge p7-badge-status-overdue">
        {formatOverdueLabel(visit.scheduled_start)}
      </span>
    );
  }

  return (
    <ItemCard
      href={`/app/visits/${visit.id}`}
      title={visit.job_title ?? "Untitled job"}
      titleBadge={
        <span style={{ display: "inline-flex", gap: "var(--space-1)", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <StatusBadge variant={visit.status as StatusVariant}>
            {VISIT_STATUS_LABELS[visit.status as VisitStatus]}
          </StatusBadge>
          {visit.sub_status && (
            <StatusBadge variant="overdue">
              {SUB_STATUS_LABELS[visit.sub_status] ?? visit.sub_status}
            </StatusBadge>
          )}
        </span>
      }
      meta={metaParts.length > 0 ? <>{metaParts}</> : undefined}
      overdue={overdue}
      data-testid="visit-card"
    />
  );
}

/**
 * The owner/admin visit triage: metric summary, overdue and needs-assignment
 * buckets, then the status-grouped remainder. Rendered both on the Visits page
 * and inside the Schedule "List" view, from one shared computation.
 */
export function VisitTriage({ visits }: { visits: TriageVisitRow[] }) {
  const triage = buildVisitTriage(visits);

  const metrics: MetricCardData[] = [
    { label: "Needs Assignment", value: triage.metrics.needsAssignment },
    { label: "Today", value: triage.metrics.today },
    { label: "Active Now", value: triage.metrics.activeNow },
    {
      label: "Overdue",
      value: triage.metrics.overdue,
      variant: triage.metrics.overdue > 0 ? "alert" : "default",
    },
  ];

  if (triage.total === 0) {
    return (
      <EmptyState
        title="No visits scheduled"
        description="Schedule visits from job detail pages."
        data-testid="visits-empty"
      />
    );
  }

  return (
    <>
      <MetricGrid metrics={metrics} />

      {triage.overdue.length > 0 && (
        <StatusSection title="Overdue" count={triage.overdue.length}>
          {triage.overdue.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <VisitItemCard visit={v} showTech showOverdue />
              </div>
              <CancelVisitButton visitId={v.id} />
            </div>
          ))}
        </StatusSection>
      )}

      {triage.unassigned.length > 0 && (
        <StatusSection title="Needs Assignment" count={triage.unassigned.length}>
          {triage.unassigned.map((v) => (
            <VisitItemCard key={v.id} visit={v} />
          ))}
        </StatusSection>
      )}

      {triage.groups.map((g) => (
        <StatusSection
          key={g.status}
          title={VISIT_STATUS_LABELS[g.status]}
          count={g.visits.length}
        >
          {g.visits.map((v) => (
            <VisitItemCard key={v.id} visit={v} showTech showOverdue />
          ))}
        </StatusSection>
      ))}
    </>
  );
}
