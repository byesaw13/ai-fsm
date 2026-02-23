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
  company_name: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
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
  company_name?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  zip?: string;
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
    company_name: initialValues?.company_name ?? "",
    address_line1: initialValues?.address_line1 ?? "",
    city: initialValues?.city ?? "",
    state: initialValues?.state ?? "",
    zip: initialValues?.zip ?? "",
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
          company_name: form.company_name.trim(),
          address_line1: form.address_line1.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip.trim(),
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
          placeholder="Full name or business name"
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
      </div>

      {/* Company & Address */}
      <div style={{
        borderTop: "1px solid var(--border)",
        paddingTop: "var(--space-4)",
        marginTop: "var(--space-2)",
      }}>
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Company &amp; Address <span style={{ fontWeight: "normal", textTransform: "none", letterSpacing: "normal" }}>(optional)</span>
        </p>
        <div className="p7-form-grid p7-form-grid-2">
          <Input
            id="company_name"
            label="Company Name"
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            error={errors.company_name}
            disabled={pending}
            containerClassName="p7-form-grid-span-2"
            placeholder="Acme Property Group"
          />
          <Input
            id="address_line1"
            label="Street Address"
            value={form.address_line1}
            onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
            error={errors.address_line1}
            disabled={pending}
            containerClassName="p7-form-grid-span-2"
            placeholder="123 Main St"
          />
          <Input
            id="city"
            label="City"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            error={errors.city}
            disabled={pending}
            placeholder="Springfield"
          />
          <Input
            id="state"
            label="State"
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            error={errors.state}
            disabled={pending}
            placeholder="IL"
          />
          <Input
            id="zip"
            label="ZIP Code"
            value={form.zip}
            onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
            error={errors.zip}
            disabled={pending}
            placeholder="62701"
          />
        </div>
      </div>

      <Textarea
        id="notes"
        label="Notes"
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        error={errors.notes}
        disabled={pending}
        rows={3}
        placeholder="Access preferences, billing notes, contact instructions..."
      />

      <div className="p7-form-actions">
        <LinkButton href={cancelHref} variant="secondary">Cancel</LinkButton>
        <Button type="submit" loading={pending} disabled={pending} data-testid={`submit-client-${mode}-btn`}>
          {mode === "create" ? "Create Client" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
