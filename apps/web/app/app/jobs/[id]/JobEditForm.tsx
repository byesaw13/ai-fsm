"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Input,
  Select,
  SectionHeader,
  Textarea,
  useToast,
} from "@/components/ui";

interface Client { id: string; name: string; }
interface Property { id: string; address: string; client_id: string; }

interface JobEditFormProps {
  jobId: string;
  initialTitle: string;
  initialClientId: string | null;
  initialPropertyId: string | null;
  initialDescription: string | null;
  initialPriority: number;
  initialActualCostCents: number | null;
  initialTravelMiles: number | null;
}

const PRIORITY_OPTIONS = [
  { value: "0", label: "None" },
  { value: "1", label: "Low" },
  { value: "2", label: "Medium" },
  { value: "3", label: "High" },
  { value: "4", label: "Urgent" },
];

export function JobEditForm({
  jobId,
  initialTitle,
  initialClientId,
  initialPropertyId,
  initialDescription,
  initialPriority,
  initialActualCostCents,
  initialTravelMiles,
}: JobEditFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [form, setForm] = useState({
    title: initialTitle,
    client_id: initialClientId ?? "",
    property_id: initialPropertyId ?? "",
    description: initialDescription ?? "",
    priority: initialPriority,
    actual_cost_dollars: initialActualCostCents !== null ? (initialActualCostCents / 100).toFixed(2) : "",
    travel_miles: initialTravelMiles !== null ? String(initialTravelMiles) : "",
  });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/v1/clients?limit=200").then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/v1/properties?limit=200").then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([clientsData, propsData]) => {
      if (!cancelled) {
        setClients(clientsData.data ?? []);
        setProperties(propsData.data ?? []);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const filteredProperties = properties.filter(p => p.client_id === form.client_id);

  useEffect(() => {
    if (form.property_id && !filteredProperties.some(p => p.id === form.property_id)) {
      setForm(prev => ({ ...prev, property_id: "" }));
    }
  }, [filteredProperties, form.property_id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setError(null);
    setPending(true);
    try {
      const actualCostCents = form.actual_cost_dollars.trim()
        ? Math.round(parseFloat(form.actual_cost_dollars) * 100)
        : null;
      const travelMiles = form.travel_miles.trim()
        ? parseFloat(form.travel_miles)
        : null;
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          client_id: form.client_id || undefined,
          property_id: form.property_id || null,
          description: form.description.trim() || null,
          priority: form.priority,
          actual_cost_cents: actualCostCents,
          travel_miles: travelMiles,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to update job");
        return;
      }
      toast.success("Job updated");
      router.refresh();
    } catch {
      setError("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card data-testid="job-edit-form">
      <SectionHeader title="Edit Details" />
      <form onSubmit={handleSubmit} className="p7-form-stack" style={{ marginTop: "var(--space-3)" }}>
        {error && (
          <Card className="p7-card-danger" padding="sm" role="alert">
            <p style={{ margin: 0 }}>{error}</p>
          </Card>
        )}
        <div className="p7-form-grid p7-form-grid-2">
          <Input
            id="edit-job-title"
            label="Title"
            required
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            disabled={pending}
            containerClassName="p7-form-grid-span-2"
          />
          <Select
            id="edit-job-client"
            label="Client"
            value={form.client_id}
            onChange={e => setForm(f => ({ ...f, client_id: e.target.value, property_id: "" }))}
            disabled={pending || clients.length === 0}
            options={clients.map(c => ({ value: c.id, label: c.name }))}
            placeholder="Select client"
          />
          <Select
            id="edit-job-property"
            label="Property"
            value={form.property_id}
            onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
            disabled={pending || !form.client_id}
            options={filteredProperties.map(p => ({ value: p.id, label: p.address }))}
            placeholder="None (optional)"
          />
          <Textarea
            id="edit-job-description"
            label="Description"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            disabled={pending}
            containerClassName="p7-form-grid-span-2"
          />
          <Select
            id="edit-job-priority"
            label="Priority"
            value={String(form.priority)}
            onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) }))}
            disabled={pending}
            options={PRIORITY_OPTIONS}
          />
          <Input
            id="edit-job-actual-cost"
            label="Actual Cost ($)"
            type="number"
            step="0.01"
            min="0"
            value={form.actual_cost_dollars}
            onChange={e => setForm(f => ({ ...f, actual_cost_dollars: e.target.value }))}
            disabled={pending}
            placeholder="e.g. 320.00"
          />
          <Input
            id="edit-job-travel-miles"
            label="Travel Miles"
            type="number"
            step="0.1"
            min="0"
            value={form.travel_miles}
            onChange={e => setForm(f => ({ ...f, travel_miles: e.target.value }))}
            disabled={pending}
            placeholder="e.g. 24.5"
          />
        </div>
        <div className="p7-form-actions">
          <Button type="submit" disabled={pending} loading={pending}>
            {pending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
