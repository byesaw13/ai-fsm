import { Card, SectionHeader } from "@/components/ui";
import type { ScheduleUtilRow } from "../queries";

/** Schedule utilization — salvaged from the retired Operations Dashboard. */
export function OperationsSection({ scheduleUtil, monthLabel }: { scheduleUtil: ScheduleUtilRow; monthLabel: string }) {
  return (
    <Card style={{ marginTop: "var(--space-6)" }}>
      <SectionHeader title="Schedule Utilization" />
      <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
        Visits scheduled in {monthLabel}.
      </p>
      <div style={{ padding: "var(--space-3)", display: "flex", gap: "var(--space-6)", flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
        <div>
          <div style={{ color: "var(--fg-muted)" }}>Scheduled</div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{scheduleUtil.scheduled_count}</div>
        </div>
        <div>
          <div style={{ color: "var(--fg-muted)" }}>Completed</div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)", color: "var(--status-success)" }}>{scheduleUtil.completed_count}</div>
        </div>
        <div>
          <div style={{ color: "var(--fg-muted)" }}>Cancelled</div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)", color: scheduleUtil.cancelled_count > 0 ? "var(--status-error)" : "inherit" }}>{scheduleUtil.cancelled_count}</div>
        </div>
        <div>
          <div style={{ color: "var(--fg-muted)" }}>Avg / week</div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{scheduleUtil.avg_per_week}</div>
        </div>
      </div>
    </Card>
  );
}
