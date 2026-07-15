"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, LinkButton, Select, SectionHeader, Textarea, useToast } from "@/components/ui";
import { INTAKE_QUESTIONS, INTAKE_METADATA_LABELS } from "@/lib/intake/questions";

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
  intake_metadata: Record<string, string>;
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
  intake_metadata: {},
};

export function IntakeForm() {
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<IntakeErrors>({});
  const [form, setForm] = useState<IntakeFormValues>(initialValues);
  const [submittedBookingId, setSubmittedBookingId] = useState<string | null>(null);
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [routingPath, setRoutingPath] = useState<"site_visit" | "remote_estimate" | "book_work" | "pending" | null>(null);
  const [pathPending, setPathPending] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);

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
          intake_metadata: Object.keys(form.intake_metadata).length > 0 ? form.intake_metadata : null,
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
      setSubmittedJobId(data.jobId ?? data.job_id ?? null);
      setRoutingPath(data.routing_path ?? "pending");
      setStep(3);
      setPending(false);
    } catch {
      setError("Unexpected error creating booking request");
      setPending(false);
    }
  }

  async function choosePath(path: "site_visit" | "book_work" | "remote_estimate") {
    if (!submittedBookingId) return;
    setPathPending(true);
    setPathError(null);
    try {
      const res = await fetch(`/api/v1/booking-requests/${submittedBookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing_path: path }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPathError(data.error?.message ?? "Failed to save path");
        setPathPending(false);
        return;
      }
      setRoutingPath(path);
      // Navigate to the right next surface
      if (path === "remote_estimate") {
        const params = new URLSearchParams({ pricing_mode: "flat_rate", booking_request_id: submittedBookingId });
        if (submittedJobId) params.set("job_id", submittedJobId);
        window.location.href = `/app/estimates/new?${params.toString()}`;
        return;
      }
      if (path === "book_work" && submittedJobId) {
        window.location.href = `/app/jobs/${submittedJobId}/visits/new?visit_type=standard&intent=book_work&bookingRequestId=${submittedBookingId}`;
        return;
      }
      if (path === "site_visit") {
        // Stay on request to confirm assessment date, or go to request detail
        window.location.href = `/app/requests/${submittedBookingId}`;
        return;
      }
      setPathPending(false);
    } catch {
      setPathError("Network error");
      setPathPending(false);
    }
  }

  if (step === 3) {
    const suggested = routingPath === "site_visit" || routingPath === "remote_estimate" || routingPath === "book_work"
      ? routingPath
      : null;
    return (
      <div className="p7-form-stack">
        <Card>
          <SectionHeader title="Request Submitted" />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              Booking request created for <strong>{form.name}</strong>.
              {suggested ? (
                <> System suggestion: <strong>{suggested === "site_visit" ? "Assessment" : suggested === "book_work" ? "Book work" : "Remote estimate"}</strong>.</>
              ) : null}
            </p>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 700 }}>
              How should we proceed?
            </p>
            {pathError ? (
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "#dc2626" }} role="alert">{pathError}</p>
            ) : null}
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {(
                [
                  { path: "site_visit" as const, title: "Schedule assessment", detail: "On-site measurements, photos, and scope before estimating." },
                  { path: "book_work" as const, title: "Book work appointment", detail: "Scope is clear — schedule a work day (no full assessment)." },
                  { path: "remote_estimate" as const, title: "Remote estimate only", detail: "No visit yet — draft estimate from notes or photos." },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.path}
                  type="button"
                  data-testid={`intake-success-path-${opt.path}`}
                  disabled={pathPending}
                  onClick={() => choosePath(opt.path)}
                  style={{
                    textAlign: "left",
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius)",
                    border: suggested === opt.path ? "2px solid var(--accent, #2563eb)" : "1px solid var(--border)",
                    background: "var(--bg-card, #fff)",
                    cursor: pathPending ? "not-allowed" : "pointer",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>
                    {opt.title}
                    {suggested === opt.path ? " · suggested" : ""}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 4 }}>{opt.detail}</div>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
          <LinkButton href="/app/requests" variant="secondary">
            All Requests
          </LinkButton>
          {submittedBookingId ? (
            <LinkButton href={`/app/requests/${submittedBookingId}` as never}>
              Open Request →
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
            {Object.entries(form.intake_metadata).map(([key, val]) => {
              const q = INTAKE_QUESTIONS[form.service_category]?.find((q) => q.key === key);
              if (!q) return null;
              const label = INTAKE_METADATA_LABELS[key]?.[val] ?? val;
              return <Detail key={key} label={q.label} value={label} />;
            })}
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
            onChange={(e) => { update("service_category", e.target.value); update("intake_metadata", {}); }}
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
          {/* Service-specific branching questions */}
          {form.service_category && INTAKE_QUESTIONS[form.service_category]?.map((q) => (
            <div key={q.key} className="p7-form-grid-span-2">
              <p className="p7-label" style={{ marginBottom: "var(--space-2)" }}>{q.label}</p>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                {q.options.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      padding: "var(--space-2) var(--space-3)",
                      border: form.intake_metadata[q.key] === opt.value ? "2px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    <input
                      type="radio"
                      name={`metadata_${q.key}`}
                      value={opt.value}
                      checked={form.intake_metadata[q.key] === opt.value}
                      onChange={() => update("intake_metadata", { ...form.intake_metadata, [q.key]: opt.value })}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
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
        <LinkButton href="/app/requests" variant="secondary">
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
