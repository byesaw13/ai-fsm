"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, LinkButton, Select } from "@/components/ui";

interface User {
  id: string;
  full_name: string;
  role: string;
}

interface FormErrors {
  scheduled_start?: string;
  scheduled_end?: string;
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

  const [form, setForm] = useState({
    scheduled_start: "",
    scheduled_end: "",
    assigned_user_id: "",
  });

  function validate(): boolean {
    const errs: FormErrors = {};

    if (!form.scheduled_start) {
      errs.scheduled_start = "Start time is required";
    }

    if (!form.scheduled_end) {
      errs.scheduled_end = "End time is required";
    }

    if (form.scheduled_start && form.scheduled_end) {
      const start = new Date(form.scheduled_start);
      const end = new Date(form.scheduled_end);
      if (end <= start) {
        errs.scheduled_end = "End time must be after start time";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setPending(true);

    try {
      const body = {
        scheduled_start: new Date(form.scheduled_start).toISOString(),
        scheduled_end: new Date(form.scheduled_end).toISOString(),
        assigned_user_id: form.assigned_user_id || undefined,
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

  const techUsers = users.filter((u) => u.role === "tech" || u.role === "admin" || u.role === "owner");

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack" data-testid="visit-schedule-form">
      {error && (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }}>{error}</p>
        </Card>
      )}

      <div className="p7-form-grid p7-form-grid-2">
        <Input
          id="scheduled_start"
          label="Start Time"
          required
          type="datetime-local"
          value={form.scheduled_start}
          onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
          disabled={pending}
          error={errors.scheduled_start}
        />

        <Input
          id="scheduled_end"
          label="End Time"
          required
          type="datetime-local"
          value={form.scheduled_end}
          onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })}
          disabled={pending}
          error={errors.scheduled_end}
        />
      </div>

      {canAssign && (
        <Select
          id="assigned_user_id"
          label="Assign To"
          value={form.assigned_user_id}
          onChange={(e) => setForm({ ...form, assigned_user_id: e.target.value })}
          disabled={pending}
          hint={users.length === 0 ? "No users available. Create users first." : undefined}
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
