"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, Card, Input, LinkButton, Textarea, useToast } from "@/components/ui";

type ClientFormMode = "create" | "edit";

interface ClientFormValues {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

interface ClientFormProps {
  mode: ClientFormMode;
  actionUrl: string;
  cancelHref: string;
  initialValues?: Partial<ClientFormValues>;
  clientId?: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export function ClientForm({ mode, actionUrl, cancelHref, initialValues, clientId }: ClientFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<ClientFormValues>({
    name: initialValues?.name ?? "",
    email: initialValues?.email ?? "",
    phone: initialValues?.phone ?? "",
    notes: initialValues?.notes ?? "",
  });

  function validate() {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = "Name is required";
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Valid email required";
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
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          notes: form.notes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error?.details) setErrors(data.error.details);
        setError(data.error?.message ?? `Failed to ${mode} client`);
        setPending(false);
        return;
      }
      toast.success(mode === "create" ? `Client created: ${form.name.trim()}` : "Client updated");
      const nextId = data.data?.id ?? clientId;
      if (mode === "create" && nextId) {
        router.push((`/app/clients/${nextId}`) as Route);
      } else {
        setPending(false);
        router.refresh();
      }
    } catch {
      setError(`Failed to ${mode} client`);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack" data-testid={`client-${mode}-form`}>
      {error ? (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }}>{error}</p>
        </Card>
      ) : null}
      <div className="p7-form-grid p7-form-grid-2">
        <Input
          id="name"
          label="Client Name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          error={errors.name}
          disabled={pending}
          containerClassName="p7-form-grid-span-2"
          placeholder="Acme Property Group"
        />
        <Input
          id="email"
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          error={errors.email}
          disabled={pending}
          placeholder="contact@example.com"
        />
        <Input
          id="phone"
          label="Phone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          error={errors.phone}
          disabled={pending}
          placeholder="(555) 555-5555"
        />
        <Textarea
          id="notes"
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          error={errors.notes}
          disabled={pending}
          rows={4}
          containerClassName="p7-form-grid-span-2"
          placeholder="Access preferences, billing notes, contact instructions..."
        />
      </div>
      <div className="p7-form-actions">
        <LinkButton href={cancelHref} variant="secondary">Cancel</LinkButton>
        <Button type="submit" loading={pending} disabled={pending} data-testid={`submit-client-${mode}-btn`}>
          {mode === "create" ? "Create Client" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
