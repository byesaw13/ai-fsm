"use client";

import { useState } from "react";
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

interface User {
  id: string;
  full_name: string;
  role: string;
}

interface FormErrors {
  schedule_date?: string;
  schedule_time?: string;
}

interface VisitScheduleFormProps {
  jobId: string;
  users: User[];
  canAssign: boolean;
}

export function VisitScheduleForm({ jobId, users, canAssign }: VisitScheduleFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const [schedule, setSchedule] = useState<ScheduleValue>({
    date: "",
    startTime: "",
    duration: 60,
  });
  const [assignedUserId, setAssignedUserId] = useState("");

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!schedule.date) errs.schedule_date = "Date is required";
    if (!schedule.startTime) errs.schedule_time = "Start time is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setPending(true);

    try {
      const { start, end } = scheduleToISOPair(schedule);
      const body = {
        scheduled_start: start!,
        scheduled_end: end!,
        assigned_user_id: assignedUserId || undefined,
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

      router.push(`/app/visits/${data.data.id}`);
    } catch {
      setError("An unexpected error occurred");
      setPending(false);
    }
  }

  const techUsers = users.filter(
    (u) => u.role === "tech" || u.role === "admin" || u.role === "owner"
  );

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack" data-testid="visit-schedule-form">
      {error && (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }}>{error}</p>
        </Card>
      )}

      <div className="p7-form-grid p7-form-grid-2">
        <ScheduleFields
          value={schedule}
          onChange={setSchedule}
          required
          disabled={pending}
          dateError={errors.schedule_date}
          timeError={errors.schedule_time}
        />
      </div>

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
        <LinkButton href={`/app/jobs/${jobId}`} variant="secondary">
          Cancel
        </LinkButton>
        <Button type="submit" disabled={pending} loading={pending}>
          {pending ? "Scheduling..." : "Schedule Visit"}
        </Button>
      </div>
    </form>
  );
}
