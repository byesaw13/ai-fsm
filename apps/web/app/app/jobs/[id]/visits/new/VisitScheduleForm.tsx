"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    <form onSubmit={handleSubmit} className="form-container">
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="scheduled_start">Start Time *</label>
          <input
            id="scheduled_start"
            type="datetime-local"
            value={form.scheduled_start}
            onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
            disabled={pending}
            className={errors.scheduled_start ? "input-error" : ""}
          />
          {errors.scheduled_start && <p className="field-error">{errors.scheduled_start}</p>}
        </div>

        <div className="form-group">
          <label htmlFor="scheduled_end">End Time *</label>
          <input
            id="scheduled_end"
            type="datetime-local"
            value={form.scheduled_end}
            onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })}
            disabled={pending}
            className={errors.scheduled_end ? "input-error" : ""}
          />
          {errors.scheduled_end && <p className="field-error">{errors.scheduled_end}</p>}
        </div>
      </div>

      {canAssign && (
        <div className="form-group">
          <label htmlFor="assigned_user_id">Assign To</label>
          <select
            id="assigned_user_id"
            value={form.assigned_user_id}
            onChange={(e) => setForm({ ...form, assigned_user_id: e.target.value })}
            disabled={pending}
          >
            <option value="">Unassigned</option>
            {techUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role})
              </option>
            ))}
          </select>
          {users.length === 0 && (
            <p className="field-hint">No users available. Create users first.</p>
          )}
        </div>
      )}

      <div className="form-actions">
        <Link href={`/app/jobs/${jobId}`} className="btn btn-secondary">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Scheduling..." : "Schedule Visit"}
        </button>
      </div>
    </form>
  );
}
