"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, Card, Input, LinkButton, Select, Textarea, useToast } from "@/components/ui";

interface ClientOption {
  id: string;
  name: string;
}

type PropertyFormMode = "create" | "edit";

interface PropertyFormValues {
  client_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
}

interface PropertyFormProps {
  mode: PropertyFormMode;
  actionUrl: string;
  cancelHref: string;
  clients: ClientOption[];
  initialValues?: Partial<PropertyFormValues>;
  propertyId?: string;
}

interface FormErrors {
  client_id?: string;
  address?: string;
  [key: string]: string | undefined;
}

export function PropertyForm({ mode, actionUrl, cancelHref, clients, initialValues, propertyId }: PropertyFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<PropertyFormValues>({
    client_id: initialValues?.client_id ?? "",
    name: initialValues?.name ?? "",
    address: initialValues?.address ?? "",
    city: initialValues?.city ?? "",
    state: initialValues?.state ?? "",
    zip: initialValues?.zip ?? "",
    notes: initialValues?.notes ?? "",
  });

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name })),
    [clients]
  );

  function validate() {
    const next: FormErrors = {};
    if (!form.client_id) next.client_id = "Client is required";
    if (!form.address.trim()) next.address = "Address is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setPending(true);
    try {
      const res = await fetch(actionUrl, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: form.client_id,
          name: form.name.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip.trim(),
          notes: form.notes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error?.details) setErrors(data.error.details);
        setError(data.error?.message ?? `Failed to ${mode} property`);
        setPending(false);
        return;
      }
      toast.success(mode === "create" ? "Property created" : "Property updated");
      const nextId = data.data?.id ?? propertyId;
      if (mode === "create" && nextId) {
        router.push((`/app/properties/${nextId}`) as Route);
      } else {
        setPending(false);
        router.refresh();
      }
    } catch {
      setError(`Failed to ${mode} property`);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack" data-testid={`property-${mode}-form`}>
      {error ? (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }}>{error}</p>
        </Card>
      ) : null}
      <div className="p7-form-grid p7-form-grid-2">
        <Select
          id="client_id"
          label="Client"
          required
          value={form.client_id}
          onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
          options={clientOptions}
          placeholder="Select client"
          error={errors.client_id}
          disabled={pending}
          containerClassName="p7-form-grid-span-2"
        />
        <Input
          id="property_name"
          label="Property Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          disabled={pending}
          containerClassName="p7-form-grid-span-2"
          placeholder="Main house, Warehouse, Unit A..."
        />
        <Input
          id="address"
          label="Address"
          required
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          error={errors.address}
          disabled={pending}
          containerClassName="p7-form-grid-span-2"
          placeholder="123 Oak Street"
        />
        <Input id="city" label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} disabled={pending} />
        <Input id="state" label="State" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} disabled={pending} />
        <Input id="zip" label="ZIP" value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} disabled={pending} />
        <div />
        <Textarea
          id="property_notes"
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          disabled={pending}
          rows={4}
          containerClassName="p7-form-grid-span-2"
          placeholder="Access notes, gate codes, parking instructions..."
        />
      </div>
      <div className="p7-form-actions">
        <LinkButton href={cancelHref} variant="secondary">Cancel</LinkButton>
        <Button type="submit" loading={pending} disabled={pending} data-testid={`submit-property-${mode}-btn`}>
          {mode === "create" ? "Create Property" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
