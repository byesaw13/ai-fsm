"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, LinkButton, Select, SectionHeader, Textarea, useToast } from "@/components/ui";

const SMS_CONSENT_TEXT =
  "By checking this box you consent to receive text messages from Dovetails Services LLC about your service requests. Message & data rates may apply. Reply STOP to opt out.";

const SERVICE_CATEGORIES = [
  { value: "painting_finishes", label: "Painting & Finishes" },
  { value: "general_repairs", label: "General Repairs" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "carpentry_furniture", label: "Carpentry & Furniture" },
  { value: "mounting_installs", label: "Mounting & Installs" },
  { value: "outdoor_seasonal", label: "Outdoor & Seasonal" },
  { value: "maintenance_small", label: "Maintenance & Small Jobs" },
  { value: "specialty_expansion", label: "Specialty Projects" },
];

const TIME_SLOTS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "flexible", label: "Flexible" },
];

const CONTACT_METHODS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "phone", label: "Phone" },
] as const;

const REFERRAL_OPTIONS = [
  { value: "online", label: "Found us online" },
  { value: "friend_neighbor", label: "Friend or neighbor" },
  { value: "realtor", label: "Realtor referral" },
  { value: "repeat", label: "Previous client" },
  { value: "other", label: "Other" },
] as const;

export const REFERRAL_LABELS: Record<string, string> = Object.fromEntries(
  REFERRAL_OPTIONS.map((o) => [o.value, o.label])
);

type PreferredContact = (typeof CONTACT_METHODS)[number]["value"];

type ReferralSource = "online" | "friend_neighbor" | "realtor" | "repeat" | "other";

type IntakeFormValues = {
  name: string;
  phone: string;
  email: string;
  service_category: string;
  service_description: string;
  preferred_date: string;
  preferred_time_slot: string;
  address: string;
  city: string;
  sms_consent: boolean;
  preferred_contact: PreferredContact;
  referral_source: ReferralSource | "";
  referral_name: string;
};

type IntakeErrors = Partial<Record<keyof IntakeFormValues, string>>;

const initialValues: IntakeFormValues = {
  name: "",
  phone: "",
  email: "",
  service_category: "",
  service_description: "",
  preferred_date: "",
  preferred_time_slot: "flexible",
  address: "",
  city: "",
  sms_consent: false,
  preferred_contact: "email",
  referral_source: "",
  referral_name: "",
};

export function IntakeForm() {
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<IntakeErrors>({});
  const [form, setForm] = useState<IntakeFormValues>(initialValues);
  const [submittedBookingId, setSubmittedBookingId] = useState<string | null>(null);
  const [routingPath, setRoutingPath] = useState<"site_visit" | "remote_estimate" | null>(null);

  const categoryLabel = useMemo(
    () => SERVICE_CATEGORIES.find((category) => category.value === form.service_category)?.label ?? form.service_category,
    [form.service_category]
  );

  const today = useMemo(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }, []);

  function update<K extends keyof IntakeFormValues>(key: K, value: IntakeFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateCapture() {
    const next: IntakeErrors = {};
    if (!form.name.trim()) next.name = "Client name is required";
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Valid email required";
    if (!form.service_category) next.service_category = "Service category is required";
    if (form.service_description.trim().length < 10) next.service_description = "Description must be at least 10 characters";
    if (!form.preferred_date) next.preferred_date = "Preferred date is required";
    if (!form.address.trim()) next.address = "Address is required";
    if (form.preferred_contact === "sms" && !form.phone.trim()) next.phone = "Phone is required for SMS contact";
    if (form.preferred_contact === "sms" && !form.sms_consent) next.sms_consent = "SMS consent is required for SMS contact";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function continueToReadBack(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (validateCapture()) setStep(2);
  }

  async function submitIntake() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/v1/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          service_category: form.service_category,
          service_description: form.service_description.trim(),
          preferred_date: form.preferred_date,
          preferred_time_slot: form.preferred_time_slot,
          address: form.address.trim(),
          city: form.city.trim() || null,
          sms_consent: form.preferred_contact === "sms" && form.sms_consent,
          preferred_contact: form.preferred_contact,
          referral_source: form.referral_source || null,
          referral_name: form.referral_source === "realtor" && form.referral_name.trim() ? form.referral_name.trim() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to create booking request");
        setPending(false);
        return;
      }
      toast.success("Booking request created");
      setSubmittedBookingId(data.id ?? null);
      setRoutingPath(data.routing_path ?? null);
      setStep(3);
    } catch {
      setError("Unexpected error creating booking request");
      setPending(false);
    }
  }

  if (step === 3) {
    const isSiteVisit = routingPath === "site_visit";
    return (
      <div className="p7-form-stack">
        <Card>
          <SectionHeader title="Intake Submitted" />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{
              padding: "var(--space-4)",
              borderRadius: "var(--radius-md)",
              background: isSiteVisit ? "var(--warning-bg, #fffbeb)" : "var(--success-bg, #f0fdf4)",
              border: `1px solid ${isSiteVisit ? "var(--warning-border, #fde68a)" : "var(--success-border, #bbf7d0)"}`,
            }}>
              <p style={{ margin: "0 0 var(--space-2)", fontWeight: 600, fontSize: "var(--text-sm)" }}>
                {isSiteVisit ? "Routing: Site Visit Recommended" : "Routing: Remote Estimate"}
              </p>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                {isSiteVisit
                  ? "Based on the description, this project should start with an on-site walkthrough to assess scope before estimating. Let the client know you'll reach out to schedule a visit."
                  : "Based on the description, this project is straightforward enough to estimate remotely. Let the client know they'll receive an estimate within 1–2 business days."}
              </p>
            </div>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              Booking request created for <strong>{form.name}</strong>.
            </p>
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
          <LinkButton href="/app/booking-requests" variant="secondary">
            All Requests
          </LinkButton>
          {submittedBookingId ? (
            <LinkButton href={`/app/booking-requests/${submittedBookingId}` as never}>
              View Request →
            </LinkButton>
          ) : null}
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="p7-form-stack">
        {error ? (
          <Card className="p7-card-danger" padding="sm" role="alert">
            <p style={{ margin: 0 }}>{error}</p>
          </Card>
        ) : null}

        <Card>
          <SectionHeader title="Read-back Confirmation" />
          <dl className="p7-detail-list">
            <Detail label="Client" value={form.name} />
            <Detail label="Phone" value={form.phone || "None"} />
            <Detail label="Email" value={form.email || "None"} />
            <Detail label="Preferred Contact" value={form.preferred_contact.toUpperCase()} />
            <Detail label="SMS Consent" value={form.sms_consent ? "Granted" : "Not granted"} />
            <Detail label="Service" value={categoryLabel} />
            <Detail label="Description" value={form.service_description} preserve />
            <Detail label="Preferred Date" value={form.preferred_date} />
            <Detail label="Preferred Time" value={form.preferred_time_slot} />
            <Detail label="Address" value={[form.address, form.city].filter(Boolean).join(", ")} />
            {form.referral_source && (
              <Detail
                label="Referred By"
                value={
                  REFERRAL_LABELS[form.referral_source] +
                  (form.referral_source === "realtor" && form.referral_name ? ` — ${form.referral_name}` : "")
                }
              />
            )}
          </dl>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
          <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={pending}>
            Edit
          </Button>
          <Button type="button" onClick={submitIntake} loading={pending}>
            Confirm &amp; Submit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={continueToReadBack} className="p7-form-stack">
      {error ? (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }}>{error}</p>
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Capture" />
        <div className="p7-form-grid p7-form-grid-2">
          <Input
            id="name"
            label="Client Name"
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            error={errors.name}
            placeholder="Full name"
            containerClassName="p7-form-grid-span-2"
          />
          <Input
            id="phone"
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            error={errors.phone}
            placeholder="(555) 555-5555"
          />
          <Input
            id="email"
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            error={errors.email}
            placeholder="client@example.com"
          />
          <Select
            id="service_category"
            label="Service Category"
            required
            value={form.service_category}
            onChange={(e) => update("service_category", e.target.value)}
            error={errors.service_category}
            options={SERVICE_CATEGORIES}
            placeholder="Select service"
            containerClassName="p7-form-grid-span-2"
          />
          <Textarea
            id="service_description"
            label="Description"
            required
            value={form.service_description}
            onChange={(e) => update("service_description", e.target.value)}
            error={errors.service_description}
            placeholder="Describe the work needed"
            containerClassName="p7-form-grid-span-2"
            rows={5}
          />
          <Input
            id="preferred_date"
            label="Preferred Date"
            type="date"
            required
            min={today}
            value={form.preferred_date}
            onChange={(e) => update("preferred_date", e.target.value)}
            error={errors.preferred_date}
          />
          <Select
            id="preferred_time_slot"
            label="Preferred Time"
            value={form.preferred_time_slot}
            onChange={(e) => update("preferred_time_slot", e.target.value)}
            options={TIME_SLOTS}
          />
          <Input
            id="address"
            label="Address"
            required
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            error={errors.address}
            placeholder="Street address"
          />
          <Input
            id="city"
            label="City"
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="City"
          />
        </div>
      </Card>

      <Card>
        <SectionHeader title="Contact Preferences" />
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="p7-label">Preferred Contact</legend>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {CONTACT_METHODS.map((method) => (
              <label
                key={method.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-2) var(--space-3)",
                  border: form.preferred_contact === method.value ? "2px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="preferred_contact"
                  value={method.value}
                  checked={form.preferred_contact === method.value}
                  onChange={() => {
                    update("preferred_contact", method.value);
                    if (method.value !== "sms") update("sms_consent", false);
                  }}
                />
                {method.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
          <input
            type="checkbox"
            checked={form.sms_consent}
            disabled={form.preferred_contact !== "sms"}
            onChange={(e) => update("sms_consent", e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span style={{ fontSize: "var(--text-sm)", color: form.preferred_contact === "sms" ? "var(--fg)" : "var(--fg-muted)" }}>
            {SMS_CONSENT_TEXT}
          </span>
        </label>
        {errors.sms_consent ? <span className="p7-field-error" role="alert">{errors.sms_consent}</span> : null}
      </Card>

      <Card>
        <SectionHeader title="Referral" />
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="p7-label">How did they hear about us? <span style={{ fontWeight: 400, color: "var(--fg-muted)" }}>(optional)</span></legend>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
            {REFERRAL_OPTIONS.map((option) => (
              <label
                key={option.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-2) var(--space-3)",
                  border: form.referral_source === option.value ? "2px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontSize: "var(--text-sm)",
                }}
              >
                <input
                  type="radio"
                  name="referral_source"
                  value={option.value}
                  checked={form.referral_source === option.value}
                  onChange={() => update("referral_source", option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        {form.referral_source === "realtor" && (
          <Input
            id="referral_name"
            label="Realtor name or company"
            value={form.referral_name}
            onChange={(e) => update("referral_name", e.target.value)}
            placeholder="e.g. Jane Smith at ABC Realty"
            style={{ marginTop: "var(--space-3)" }}
          />
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <LinkButton href="/app/booking-requests" variant="secondary">
          Cancel
        </LinkButton>
        <Button type="submit">
          Continue
        </Button>
      </div>
    </form>
  );
}

function Detail({ label, value, preserve = false }: { label: string; value: string; preserve?: boolean }) {
  return (
    <div className="p7-detail-row">
      <dt>{label}</dt>
      <dd style={preserve ? { whiteSpace: "pre-wrap" } : undefined}>{value}</dd>
    </div>
  );
}
