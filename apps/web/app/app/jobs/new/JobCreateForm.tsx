"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, LinkButton, Select, Textarea } from "@/components/ui";

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
  { value: 0, label: "None" },
  { value: 1, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 3, label: "High" },
  { value: 4, label: "Urgent" },
];

interface JobCreateFormProps {
  clients: Client[];
  properties: Property[];
  initialClientId?: string;
  initialPropertyId?: string;
}

export function JobCreateForm({
  clients,
  properties,
  initialClientId,
  initialPropertyId,
}: JobCreateFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const [form, setForm] = useState({
    title: "",
    client_id: initialClientId && clients.some((c) => c.id === initialClientId) ? initialClientId : "",
    property_id:
      initialPropertyId && properties.some((p) => p.id === initialPropertyId)
        ? initialPropertyId
        : "",
    description: "",
    priority: 0,
    scheduled_start: "",
    scheduled_end: "",
  });

  const filteredProperties = properties.filter(
    (p) => p.client_id === form.client_id
  );

  useEffect(() => {
    if (!form.property_id) return;
    const exists = filteredProperties.some((p) => p.id === form.property_id);
    if (!exists) {
      setForm((prev) => ({ ...prev, property_id: "" }));
    }
  }, [filteredProperties, form.property_id]);

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
        scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : undefined,
        scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : undefined,
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
    <form onSubmit={handleSubmit} className="p7-form-stack" data-testid="job-create-form">
      {error && (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }}>{error}</p>
        </Card>
      )}

      <div className="p7-form-grid p7-form-grid-2">
        <Input
          id="title"
          label="Title"
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g., Kitchen faucet repair"
          disabled={pending}
          error={errors.title}
          containerClassName="p7-form-grid-span-2"
        />

        <Select
          id="client_id"
          label="Client"
          required
          value={form.client_id}
          onChange={(e) =>
            setForm({ ...form, client_id: e.target.value, property_id: "" })
          }
          disabled={pending}
          error={errors.client_id}
          hint={clients.length === 0 ? "No clients found. Create a client first." : undefined}
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="Select a client"
        />

        <Select
          id="property_id"
          label="Property"
          value={form.property_id}
          onChange={(e) => setForm({ ...form, property_id: e.target.value })}
          disabled={pending || !form.client_id}
          hint={
            form.client_id && filteredProperties.length === 0
              ? "No properties for this client."
              : undefined
          }
          options={filteredProperties.map((p) => ({ value: p.id, label: p.address }))}
          placeholder="Select a property (optional)"
        />

        <Textarea
          id="description"
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Job details, notes, or instructions..."
          rows={4}
          disabled={pending}
          containerClassName="p7-form-grid-span-2"
        />

        <Select
          id="priority"
          label="Priority"
          value={String(form.priority)}
          onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
          disabled={pending}
          options={PRIORITY_OPTIONS.map((opt) => ({ value: String(opt.value), label: opt.label }))}
        />

        <div />

        <Input
          id="scheduled_start"
          label="Scheduled Start"
          type="datetime-local"
          value={form.scheduled_start}
          onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
          disabled={pending}
        />

        <Input
          id="scheduled_end"
          label="Scheduled End"
          type="datetime-local"
          value={form.scheduled_end}
          onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })}
          disabled={pending}
          error={errors.scheduled_end}
        />
      </div>

      <div className="p7-form-actions">
        <LinkButton href="/app/jobs" variant="secondary">
          Cancel
        </LinkButton>
        <Button type="submit" disabled={pending} loading={pending}>
          {pending ? "Creating..." : "Create Job"}
        </Button>
      </div>
    </form>
  );
}
