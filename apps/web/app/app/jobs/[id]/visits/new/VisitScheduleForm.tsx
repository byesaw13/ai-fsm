"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  LinkButton,
  ScheduleFields,
  Select,
} from "@/components/ui";
import type { ScheduleValue } from "@/components/ui";
import { scheduleToISOPair } from "@/components/ui";
import { reviewScheduleDay } from "@/lib/jobs/schedule-guard";
import { VISIT_TYPES, VISIT_TYPE_LABELS, type VisitType } from "@ai-fsm/domain";

interface User {
  id: string;
  full_name: string;
  role: string;
}

interface FormErrors {
  schedule_date?: string;
  schedule_time?: string;
  multi_days?: string;
}

interface WorkOrderOption {
  id: string;
  title: string;
  status?: string;
}

interface VisitScheduleFormProps {
  jobId: string;
  users: User[];
  canAssign: boolean;
  jobCategory?: string | null;
  bookingRequestId?: string;
  workOrders?: WorkOrderOption[];
  initialWorkOrderId?: string | null;
  initialMultiDay?: boolean;
  /** Prefer site_visit (assessment) or standard (work day). */
  initialVisitType?: VisitType | null;
  /** assessment | book_work — drives duration defaults and labels. */
  intent?: "assessment" | "book_work" | null;
}

function formatDayLabel(dateStr: string, startTime: string, durationMin: number): string {
  const start = new Date(`${dateStr}T${startTime}:00`);
  const end = new Date(start.getTime() + durationMin * 60_000);
  const day = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t0 = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const t1 = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t0} – ${t1}`;
}

function defaultVisitType(
  jobCategory: string | null | undefined,
  initialVisitType: VisitType | null | undefined,
  intent: "assessment" | "book_work" | null | undefined,
): VisitType {
  if (initialVisitType && (VISIT_TYPES as readonly string[]).includes(initialVisitType)) {
    return initialVisitType;
  }
  if (intent === "assessment") return "site_visit";
  if (intent === "book_work") return "standard";
  if (jobCategory === "realtor_baseline") return "realtor_baseline";
  return "standard";
}

export function VisitScheduleForm({
  jobId,
  users,
  canAssign,
  jobCategory,
  bookingRequestId,
  workOrders = [],
  initialWorkOrderId = null,
  initialMultiDay = false,
  initialVisitType = null,
  intent = null,
}: VisitScheduleFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [scheduleWarning, setScheduleWarning] = useState("");
  const [multiDay, setMultiDay] = useState(initialMultiDay);
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [extraDateInput, setExtraDateInput] = useState("");

  const resolvedType = defaultVisitType(jobCategory, initialVisitType, intent);
  const defaultDuration =
    multiDay || initialMultiDay || resolvedType === "standard" || resolvedType === "punch_list"
      ? 480
      : resolvedType === "site_visit"
        ? 120
        : 60;

  const [schedule, setSchedule] = useState<ScheduleValue>({
    date: "",
    startTime: resolvedType === "site_visit" ? "09:00" : "08:00",
    duration: defaultDuration,
  });
  const [assignedUserId, setAssignedUserId] = useState("");
  const [visitType, setVisitType] = useState<VisitType>(resolvedType);
  const lockedWo = !!initialWorkOrderId;
  const [workOrderId, setWorkOrderId] = useState(
    initialWorkOrderId ?? (workOrders.length === 1 ? workOrders[0].id : ""),
  );
  const needsWorkOrder =
    visitType === "standard" || visitType === "punch_list";

  const allDates = useMemo(() => {
    const set = new Set<string>();
    if (schedule.date) set.add(schedule.date);
    for (const d of extraDates) set.add(d);
    return Array.from(set).sort();
  }, [schedule.date, extraDates]);

  const previewDays = useMemo(() => {
    if (!schedule.startTime || allDates.length === 0) return [];
    return allDates.map((date) => ({
      date,
      label: formatDayLabel(date, schedule.startTime, schedule.duration),
      ...scheduleToISOPair({ date, startTime: schedule.startTime, duration: schedule.duration }),
    }));
  }, [allDates, schedule.startTime, schedule.duration]);

  function validate(): boolean {
    const errs: FormErrors = {};
    if (multiDay) {
      if (allDates.length === 0) errs.multi_days = "Add at least one date";
      if (!schedule.startTime) errs.schedule_time = "Start time is required";
    } else {
      if (!schedule.date) errs.schedule_date = "Date is required";
      if (!schedule.startTime) errs.schedule_time = "Start time is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function addExtraDate() {
    if (!extraDateInput) return;
    if (extraDates.includes(extraDateInput) || extraDateInput === schedule.date) {
      setExtraDateInput("");
      return;
    }
    setExtraDates((prev) => [...prev, extraDateInput].sort());
    setExtraDateInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setPending(true);

    try {
      if (needsWorkOrder && !workOrderId) {
        setError("Select a work order for this visit");
        setPending(false);
        return;
      }

      if (multiDay) {
        const days = previewDays
          .filter((d) => d.start && d.end)
          .map((d) => ({ scheduled_start: d.start!, scheduled_end: d.end! }));

        if (days.length === 0) {
          setError("Add valid dates to schedule");
          setPending(false);
          return;
        }

        const res = await fetch(`/api/v1/jobs/${jobId}/visits/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assigned_user_id: assignedUserId || undefined,
            visit_type: visitType,
            ...(needsWorkOrder && workOrderId ? { work_order_id: workOrderId } : {}),
            days,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error?.message || "Failed to schedule visits");
          setPending(false);
          return;
        }
        // Prefer work order page when we came from / booked under a WO
        if (workOrderId) {
          router.push(`/app/work-orders/${workOrderId}`);
        } else {
          router.push(`/app/jobs/${jobId}`);
        }
        return;
      }

      const { start, end } = scheduleToISOPair(schedule);
      const body = {
        scheduled_start: start!,
        scheduled_end: end!,
        assigned_user_id: assignedUserId || undefined,
        booking_request_id: bookingRequestId,
        visit_type: visitType,
        ...(needsWorkOrder && workOrderId ? { work_order_id: workOrderId } : {}),
      };

      const res = await fetch(`/api/v1/jobs/${jobId}/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.details) {
          const fieldErrors: FormErrors = {};
          for (const [key, vals] of Object.entries(data.error.details)) {
            fieldErrors[key as keyof FormErrors] = (vals as string[])[0];
          }
          setErrors(fieldErrors);
        } else {
          setError(data.error?.message || "Failed to schedule visit");
        }
        setPending(false);
        return;
      }

      const visitId = data.data.id;
      router.push(`/app/visits/${visitId}`);
    } catch {
      setError("An unexpected error occurred");
      setPending(false);
    }
  }

  const techUsers = users.filter(
    (u) => u.role === "tech" || u.role === "admin" || u.role === "owner"
  );

  const woOptions = workOrders.map((wo) => ({
    value: wo.id,
    label: wo.status && wo.status !== "ready" && wo.status !== "scheduled"
      ? `${wo.title} (${wo.status})`
      : wo.title,
  }));

  // Ensure locked WO appears even if not in list (edge case)
  if (lockedWo && initialWorkOrderId && !woOptions.some((o) => o.value === initialWorkOrderId)) {
    woOptions.unshift({ value: initialWorkOrderId, label: "Selected work order" });
  }

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack" data-testid="visit-schedule-form">
      {error && (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }}>{error}</p>
        </Card>
      )}

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={multiDay}
          data-testid="multi-day-toggle"
          onChange={(e) => {
            const on = e.target.checked;
            setMultiDay(on);
            if (on && schedule.duration < 240) {
              setSchedule((s) => ({ ...s, duration: 480 }));
            }
          }}
        />
        Schedule multiple days (same hours each day)
      </label>

      {!multiDay ? (
        <div className="p7-form-grid p7-form-grid-2">
          <ScheduleFields
            value={schedule}
            onChange={(s) => {
              setSchedule(s);
              setScheduleWarning(reviewScheduleDay(s.date, jobCategory ?? null).warning ?? "");
            }}
            required
            disabled={pending}
            dateError={errors.schedule_date}
            timeError={errors.schedule_time}
          />
        </div>
      ) : (
        <div className="p7-form-stack" style={{ gap: "var(--space-3)" }}>
          <div className="p7-form-grid p7-form-grid-2">
            <ScheduleFields
              value={schedule}
              onChange={(s) => {
                setSchedule(s);
                if (s.date) {
                  setScheduleWarning(reviewScheduleDay(s.date, jobCategory ?? null).warning ?? "");
                }
              }}
              required
              disabled={pending}
              dateError={errors.schedule_date}
              timeError={errors.schedule_time}
            />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
            First day is set above. Add more dates with the same start time and duration.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label htmlFor="extra_date" style={{ fontSize: "var(--text-xs)", fontWeight: 600, display: "block", marginBottom: 4 }}>
                Add another day
              </label>
              <input
                id="extra_date"
                type="date"
                value={extraDateInput}
                onChange={(e) => setExtraDateInput(e.target.value)}
                disabled={pending}
                data-testid="multi-day-add-date"
                style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
              />
            </div>
            <Button type="button" variant="secondary" onClick={addExtraDate} disabled={pending || !extraDateInput}>
              Add day
            </Button>
          </div>
          {errors.multi_days && (
            <p className="error-inline" style={{ margin: 0 }}>{errors.multi_days}</p>
          )}
          {previewDays.length > 0 && (
            <div
              data-testid="multi-day-preview"
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 12px",
                background: "var(--bg-subtle, #fafaf9)",
              }}
            >
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, marginBottom: 6 }}>
                Creates {previewDays.length} visit{previewDays.length === 1 ? "" : "s"}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-sm)" }}>
                {previewDays.map((d) => (
                  <li key={d.date} style={{ marginBottom: 4 }}>
                    {d.label}
                    {d.date !== schedule.date && (
                      <button
                        type="button"
                        onClick={() => setExtraDates((prev) => prev.filter((x) => x !== d.date))}
                        style={{
                          marginLeft: 8,
                          border: "none",
                          background: "transparent",
                          color: "var(--fg-muted)",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {scheduleWarning && (
        <p className="warning-inline" data-testid="schedule-day-warning">{scheduleWarning}</p>
      )}

      <Select
        id="visit_type"
        label="Visit Type"
        value={visitType}
        onChange={(e) => setVisitType(e.target.value as VisitType)}
        disabled={pending}
        options={VISIT_TYPES.map((t) => ({ value: t, label: VISIT_TYPE_LABELS[t] }))}
        hint={visitType === "realtor_baseline" ? "Seeds a pre-listing inspection checklist." : undefined}
      />

      {needsWorkOrder && (
        workOrders.length > 0 || lockedWo ? (
          <Select
            id="work_order_id"
            label="Work Order"
            value={workOrderId}
            onChange={(e) => setWorkOrderId(e.target.value)}
            disabled={pending || lockedWo}
            required
            options={woOptions}
            placeholder="Select work order"
            hint={
              lockedWo
                ? "Linked from this work order. Field days (visits) will attach here."
                : "Standard field work must attach to a work order under this project."
            }
          />
        ) : (
          <Card className="p7-card-warning" padding="sm" data-testid="no-work-order-hint">
            <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              No work order on this project yet. Create a work order first, then schedule field days under it.
            </p>
          </Card>
        )
      )}

      {canAssign && (
        <Select
          id="assigned_user_id"
          label="Assign To"
          value={assignedUserId}
          onChange={(e) => setAssignedUserId(e.target.value)}
          disabled={pending}
          hint={
            users.length === 0
              ? "No users available. Create users first."
              : undefined
          }
          options={techUsers.map((u) => ({
            value: u.id,
            label: `${u.full_name} (${u.role})`,
          }))}
          placeholder="Unassigned"
        />
      )}

      <div className="p7-form-actions">
        <LinkButton
          href={workOrderId ? `/app/work-orders/${workOrderId}` : `/app/jobs/${jobId}`}
          variant="secondary"
        >
          Cancel
        </LinkButton>
        <Button
          type="submit"
          disabled={pending || (needsWorkOrder && !workOrderId)}
          loading={pending}
          data-testid="schedule-visit-submit"
        >
          {pending
            ? "Scheduling…"
            : multiDay
              ? `Schedule ${Math.max(allDates.length, 1)} Day${allDates.length === 1 ? "" : "s"}`
              : "Schedule Visit"}
        </Button>
      </div>
    </form>
  );
}
