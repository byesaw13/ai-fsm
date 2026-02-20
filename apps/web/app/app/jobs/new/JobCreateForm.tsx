"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Client {
  id: string;
  name: string;
}

interface Property {
  id: string;
  address: string;
  client_id: string;
}

interface FormErrors {
  title?: string;
  client_id?: string;
  scheduled_end?: string;
}

const PRIORITY_OPTIONS = [
  { value: 0, label: "Low" },
  { value: 1, label: "Medium" },
  { value: 2, label: "High" },
  { value: 3, label: "Urgent" },
];

interface JobCreateFormProps {
  clients: Client[];
  properties: Property[];
}

export function JobCreateForm({ clients, properties }: JobCreateFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [selectedClientId, setSelectedClientId] = useState("");

  const [form, setForm] = useState({
    title: "",
    client_id: "",
    property_id: "",
    description: "",
    priority: 0,
    scheduled_start: "",
    scheduled_end: "",
  });

  useEffect(() => {
    setSelectedClientId(form.client_id);
  }, [form.client_id]);

  const filteredProperties = properties.filter(
    (p) => p.client_id === selectedClientId
  );

  function validate(): boolean {
    const errs: FormErrors = {};

    if (!form.title.trim()) {
      errs.title = "Title is required";
    } else if (form.title.length > 255) {
      errs.title = "Title must be 255 characters or less";
    }

    if (!form.client_id) {
      errs.client_id = "Client is required";
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
        title: form.title.trim(),
        client_id: form.client_id,
        property_id: form.property_id || undefined,
        description: form.description.trim() || undefined,
        priority: form.priority,
        scheduled_start: form.scheduled_start || undefined,
        scheduled_end: form.scheduled_end || undefined,
      };

      const res = await fetch("/api/v1/jobs", {
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
          setError(data.error?.message || "Failed to create job");
        }
        setPending(false);
        return;
      }

      router.push(`/app/jobs/${data.data.id}`);
    } catch {
      setError("An unexpected error occurred");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-container">
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="title">Title *</label>
        <input
          id="title"
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g., Kitchen faucet repair"
          disabled={pending}
          className={errors.title ? "input-error" : ""}
        />
        {errors.title && <p className="field-error">{errors.title}</p>}
      </div>

      <div className="form-group">
        <label htmlFor="client_id">Client *</label>
        <select
          id="client_id"
          value={form.client_id}
          onChange={(e) => setForm({ ...form, client_id: e.target.value, property_id: "" })}
          disabled={pending}
          className={errors.client_id ? "input-error" : ""}
        >
          <option value="">Select a client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.client_id && <p className="field-error">{errors.client_id}</p>}
        {clients.length === 0 && (
          <p className="field-hint">No clients found. Create a client first.</p>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="property_id">Property</label>
        <select
          id="property_id"
          value={form.property_id}
          onChange={(e) => setForm({ ...form, property_id: e.target.value })}
          disabled={pending || !selectedClientId}
        >
          <option value="">Select a property (optional)</option>
          {filteredProperties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.address}
            </option>
          ))}
        </select>
        {selectedClientId && filteredProperties.length === 0 && (
          <p className="field-hint">No properties for this client.</p>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Job details, notes, or instructions..."
          rows={3}
          disabled={pending}
        />
      </div>

      <div className="form-group">
        <label htmlFor="priority">Priority</label>
        <select
          id="priority"
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
          disabled={pending}
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="scheduled_start">Scheduled Start</label>
          <input
            id="scheduled_start"
            type="datetime-local"
            value={form.scheduled_start}
            onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
            disabled={pending}
          />
        </div>

        <div className="form-group">
          <label htmlFor="scheduled_end">Scheduled End</label>
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

      <div className="form-actions">
        <Link href="/app/jobs" className="btn btn-secondary">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Creating..." : "Create Job"}
        </button>
      </div>
    </form>
  );
}
