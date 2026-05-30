"use client";

import { useState } from "react";
import { INTAKE_QUESTIONS } from "@/lib/intake/questions";

interface IntakeClientFormProps {
  token: string;
  leadName: string;
  leadEmail: string;
  leadPhone: string;
}

const SERVICE_CATEGORIES = [
  { value: "painting_finishes",   label: "Painting (interior or exterior)" },
  { value: "general_repairs",     label: "General repairs / patching" },
  { value: "plumbing",            label: "Plumbing" },
  { value: "electrical",          label: "Electrical" },
  { value: "carpentry_furniture", label: "Carpentry / furniture" },
  { value: "outdoor_seasonal",    label: "Outdoor / seasonal" },
  { value: "mounting_installs",   label: "Mounting / installs" },
  { value: "maintenance_small",   label: "Small maintenance task" },
  { value: "specialty_expansion", label: "Major project / renovation" },
  { value: "other",               label: "Not sure / something else" },
] as const;

const TIME_SLOTS = [
  { value: "morning",   label: "Morning (8am–12pm)" },
  { value: "afternoon", label: "Afternoon (12pm–4pm)" },
  { value: "evening",   label: "Evening (4pm–7pm)" },
  { value: "flexible",  label: "Flexible — anytime works" },
];

type Step = "details" | "service" | "done";

export function IntakeClientForm({ token, leadName, leadEmail, leadPhone }: IntakeClientFormProps) {
  const [step, setStep] = useState<Step>("details");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: contact details
  const [name, setName] = useState(leadName);
  const [email, setEmail] = useState(leadEmail);
  const [phone, setPhone] = useState(leadPhone);

  // Step 2: service info
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("flexible");

  const questions = category ? (INTAKE_QUESTIONS[category] ?? []) : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || description.trim().length < 20) {
      setError("Please describe your project in at least 20 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          service_category: category || "general_repairs",
          service_description: description.trim(),
          intake_metadata: intakeAnswers,
          address: address.trim(),
          city: city.trim(),
          zip: zip.trim(),
          preferred_date: preferredDate || null,
          preferred_time_slot: timeSlot,
        }),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: { message?: string } };
        setError(json.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setStep("done");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>Got it — thank you!</h2>
        <p style={{ fontSize: 15, color: "#52525b", lineHeight: 1.6, margin: "0 0 8px" }}>
          We received your project details and will be in touch within 1 business day.
        </p>
        <p style={{ fontSize: 13, color: "#71717a" }}>
          Dovetails Services LLC · Southern NH &amp; Merrimack Valley MA
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Contact info ──────────────────────────────────────────────── */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Your contact info</legend>

        <div style={fieldStyle}>
          <label style={labelStyle}>Name *</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Email *</label>
          <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Phone</label>
          <input type="tel" style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
        </div>
      </fieldset>

      {/* ── Service details ───────────────────────────────────────────── */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Your project</legend>

        <div style={fieldStyle}>
          <label style={labelStyle}>What type of service do you need?</label>
          <select
            style={inputStyle}
            value={category}
            onChange={(e) => { setCategory(e.target.value); setIntakeAnswers({}); }}
            required
          >
            <option value="">— Select a category —</option>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Branching questions */}
        {questions.map((q) => (
          <div key={q.key} style={fieldStyle}>
            <label style={labelStyle}>{q.label}</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {q.options.map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name={q.key}
                    value={opt.value}
                    checked={intakeAnswers[q.key] === opt.value}
                    onChange={() => setIntakeAnswers((prev) => ({ ...prev, [q.key]: opt.value }))}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        ))}

        <div style={fieldStyle}>
          <label style={labelStyle}>Describe your project * <span style={{ fontWeight: 400, color: "#71717a" }}>(the more detail, the better)</span></label>
          <textarea
            style={{ ...inputStyle, minHeight: 100, resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. I have two bedrooms that need painting — walls and trim. The current color is dark green and we'd like off-white."
            required
            minLength={20}
          />
          <span style={{ fontSize: 12, color: description.length < 20 ? "#71717a" : "#16a34a" }}>
            {description.length} / 20 characters minimum
          </span>
        </div>
      </fieldset>

      {/* ── Property & scheduling ─────────────────────────────────────── */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Location &amp; timing</legend>

        <div style={fieldStyle}>
          <label style={labelStyle}>Street address</label>
          <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>City</label>
            <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>ZIP</label>
            <input style={inputStyle} value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g. 03060" />
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Preferred start date <span style={{ fontWeight: 400, color: "#71717a" }}>(optional)</span></label>
          <input
            type="date"
            style={inputStyle}
            value={preferredDate}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setPreferredDate(e.target.value)}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Best time of day</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TIME_SLOTS.map((ts) => (
              <label key={ts.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="time_slot"
                  value={ts.value}
                  checked={timeSlot === ts.value}
                  onChange={() => setTimeSlot(ts.value)}
                />
                {ts.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      {error && (
        <p style={{ color: "#dc2626", fontSize: 14, margin: 0 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          background: submitting ? "#71717a" : "#0f172a",
          color: "#fff",
          padding: "14px 24px",
          borderRadius: 6,
          border: "none",
          fontSize: 15,
          fontWeight: 600,
          cursor: submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Submitting…" : "Submit my project details"}
      </button>

      <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
        By submitting, you agree to be contacted by Dovetails Services LLC regarding your project.
        We won&apos;t share your information.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const fieldsetStyle: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "16px 20px",
  margin: 0,
};

const legendStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  padding: "0 4px",
  color: "#18181b",
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginTop: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 14,
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};
