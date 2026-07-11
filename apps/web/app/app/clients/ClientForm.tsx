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
  relationship_type: "standard" | "realtor" | "preferred" | "referral_partner";
  travel_rule:
    | "standard_policy"
    | "mileage_waived"
    | "travel_time_waived"
    | "all_travel_waived"
    | "custom_included_radius"
    | "custom_mileage_rate"
    | "custom_travel_time_rate"
    | "minimum_project_value_exemption"
    | "manual_review_required";
  /** One-way miles included before billing (custom_included_radius). */
  custom_included_one_way_miles: string;
  /** Miles rate as dollars per mile in the UI (stored as cents). */
  custom_mileage_rate_dollars: string;
  /** Travel-time rate as dollars per hour in the UI (stored as cents/hr). */
  custom_travel_time_rate_dollars: string;
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
    relationship_type: initialValues?.relationship_type ?? "standard",
    travel_rule: initialValues?.travel_rule ?? "standard_policy",
    custom_included_one_way_miles:
      initialValues?.custom_included_one_way_miles != null &&
      initialValues.custom_included_one_way_miles !== ""
        ? String(initialValues.custom_included_one_way_miles)
        : "",
    custom_mileage_rate_dollars:
      initialValues?.custom_mileage_rate_dollars != null &&
      initialValues.custom_mileage_rate_dollars !== ""
        ? String(initialValues.custom_mileage_rate_dollars)
        : "",
    custom_travel_time_rate_dollars:
      initialValues?.custom_travel_time_rate_dollars != null &&
      initialValues.custom_travel_time_rate_dollars !== ""
        ? String(initialValues.custom_travel_time_rate_dollars)
        : "",
  });

  function validate() {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = "Name is required";
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Valid email required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function parseOptionalNumber(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setPending(true);
    try {
      const includedMiles = parseOptionalNumber(form.custom_included_one_way_miles);
      const mileageDollars = parseOptionalNumber(form.custom_mileage_rate_dollars);
      const travelTimeDollars = parseOptionalNumber(form.custom_travel_time_rate_dollars);

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
        company_name: form.company_name.trim(),
        address_line1: form.address_line1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        relationship_type: form.relationship_type,
        travel_rule: form.travel_rule,
      };

      // PATCH already accepts these; only send when relevant so create stays lean.
      if (form.travel_rule === "custom_included_radius") {
        payload.custom_included_one_way_miles = includedMiles;
      }
      if (form.travel_rule === "custom_mileage_rate") {
        payload.custom_mileage_rate_cents =
          mileageDollars == null ? null : Math.round(mileageDollars * 100);
      }
      if (form.travel_rule === "custom_travel_time_rate") {
        payload.custom_travel_time_rate_cents =
          travelTimeDollars == null ? null : Math.round(travelTimeDollars * 100);
      }

      const res = await fetch(actionUrl, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

      {/* Relationship & travel rules */}
      <div style={{
        borderTop: "1px solid var(--border)",
        paddingTop: "var(--space-4)",
        marginTop: "var(--space-2)",
      }}>
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)", color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Relationship &amp; travel
        </p>
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          Marking someone as a Realtor does not auto-waive travel. Set the travel rule explicitly.
        </p>
        <div className="p7-form-grid p7-form-grid-2">
          <div className="form-group">
            <label htmlFor="relationship_type">Customer type</label>
            <select
              id="relationship_type"
              value={form.relationship_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  relationship_type: e.target.value as ClientFormValues["relationship_type"],
                }))
              }
              disabled={pending}
            >
              <option value="standard">Standard Customer</option>
              <option value="realtor">Realtor</option>
              <option value="preferred">Preferred Client</option>
              <option value="referral_partner">Referral Partner</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="travel_rule">Travel rule</label>
            <select
              id="travel_rule"
              value={form.travel_rule}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  travel_rule: e.target.value as ClientFormValues["travel_rule"],
                }))
              }
              disabled={pending}
            >
              <option value="standard_policy">Standard policy</option>
              <option value="mileage_waived">Mileage waived</option>
              <option value="travel_time_waived">Travel time waived</option>
              <option value="all_travel_waived">All travel waived</option>
              <option value="custom_included_radius">Custom included radius</option>
              <option value="custom_mileage_rate">Custom mileage rate</option>
              <option value="custom_travel_time_rate">Custom travel-time rate</option>
              <option value="minimum_project_value_exemption">Min project value exemption</option>
              <option value="manual_review_required">Manual review required</option>
            </select>
          </div>
        </div>

        {form.travel_rule === "custom_included_radius" ||
        form.travel_rule === "custom_mileage_rate" ||
        form.travel_rule === "custom_travel_time_rate" ? (
          <div className="p7-form-grid p7-form-grid-2" style={{ marginTop: "var(--space-3)" }}>
            {form.travel_rule === "custom_included_radius" ? (
              <Input
                id="custom_included_one_way_miles"
                label="Included one-way miles"
                type="number"
                min={0}
                step="0.1"
                value={form.custom_included_one_way_miles}
                onChange={(e) =>
                  setForm((f) => ({ ...f, custom_included_one_way_miles: e.target.value }))
                }
                disabled={pending}
                placeholder="e.g. 25"
                hint="Miles included before billing travel"
              />
            ) : null}
            {form.travel_rule === "custom_mileage_rate" ? (
              <Input
                id="custom_mileage_rate_dollars"
                label="Custom mileage rate ($/mi)"
                type="number"
                min={0}
                step="0.01"
                value={form.custom_mileage_rate_dollars}
                onChange={(e) =>
                  setForm((f) => ({ ...f, custom_mileage_rate_dollars: e.target.value }))
                }
                disabled={pending}
                placeholder="e.g. 0.70"
                hint="Billed per mile beyond included radius"
              />
            ) : null}
            {form.travel_rule === "custom_travel_time_rate" ? (
              <Input
                id="custom_travel_time_rate_dollars"
                label="Custom travel-time rate ($/hr)"
                type="number"
                min={0}
                step="0.01"
                value={form.custom_travel_time_rate_dollars}
                onChange={(e) =>
                  setForm((f) => ({ ...f, custom_travel_time_rate_dollars: e.target.value }))
                }
                disabled={pending}
                placeholder="e.g. 65.00"
                hint="Hourly rate for billable travel time"
              />
            ) : null}
          </div>
        ) : null}
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
