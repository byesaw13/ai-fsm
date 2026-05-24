"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
}

interface BookingClientProps {
  serviceCategories: ServiceCategory[];
}

const SMS_CONSENT_TEXT =
  "By checking this box you consent to receive text messages from Dovetails Services LLC about your service requests. Message & data rates may apply. Reply STOP to opt out.";

const NEXT_STEPS_SITE_VISIT = [
  { title: "We review your request", body: "We look at every submission within 1 business day." },
  { title: "We schedule a walkthrough", body: "For this type of project we like to see the space first — we'll reach out to set up a quick on-site assessment." },
  { title: "You get a written estimate", body: "After the walkthrough we send a detailed estimate before any work begins." },
];

const NEXT_STEPS_REMOTE = [
  { title: "We review your request", body: "We look at every submission within 1 business day." },
  { title: "We send you an estimate", body: "Based on what you've described we can put together a quote — expect it within 1–2 business days." },
  { title: "We schedule your visit", body: "Once you approve the estimate we'll book a time that works for you." },
];

function BookingLogo() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
      }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 16, letterSpacing: "-0.5px" }}>DV</span>
      </div>
      <div style={{ textAlign: "left" }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#111827", lineHeight: 1.1 }}>Dovetails</div>
        <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.1 }}>Services LLC</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingClient({ serviceCategories }: BookingClientProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [routingPath, setRoutingPath] = useState<"site_visit" | "remote_estimate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [serviceCategory, setServiceCategory] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTimeSlot, setPreferredTimeSlot] = useState<"morning" | "afternoon" | "evening">("morning");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredContact, setPreferredContact] = useState<"email" | "sms" | "phone">("email");
  const [smsConsent, setSmsConsent] = useState(false);
  const [referralSource, setReferralSource] = useState<"online" | "friend_neighbor" | "realtor" | "repeat" | "other" | "">("");
  const [referralName, setReferralName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(formatDateInputValue(new Date()));
  }, []);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email || null,
          phone: phone || null,
          service_category: serviceCategory,
          service_description: serviceDescription,
          preferred_date: preferredDate,
          preferred_time_slot: preferredTimeSlot,
          address,
          city: city || null,
          state: state || null,
          zip: zip || null,
          access_notes: accessNotes || null,
          preferred_contact: preferredContact,
          sms_consent: preferredContact === "sms" && smsConsent,
          referral_source: referralSource || null,
          referral_name: referralSource === "realtor" && referralName.trim() ? referralName.trim() : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setRoutingPath(data.routing_path ?? null);
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "32px 16px" }}>
        {/* Brand header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <BookingLogo />
        </div>

        <div style={{ maxWidth: 560, margin: "0 auto", background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 40, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>✓</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Request Received!</h1>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>
            {routingPath === "site_visit"
              ? <>Thanks, {name}! Based on your project description, we&apos;ll reach out to schedule a quick walkthrough before sending an estimate.</>
              : <>Thanks, {name}! We&apos;ll review your request and send you an estimate within 1–2 business days.</>}
          </p>

          {/* Request summary */}
          <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, textAlign: "left", marginBottom: 28 }}>
            <p style={{ margin: "0 0 8px", fontSize: 14 }}><strong>Service:</strong> {serviceCategories.find((c) => c.id === serviceCategory)?.label}</p>
            <p style={{ margin: "0 0 8px", fontSize: 14 }}><strong>Preferred Date:</strong> {new Date(preferredDate + "T00:00:00").toLocaleDateString()}</p>
            <p style={{ margin: 0, fontSize: 14 }}><strong>Time:</strong> {preferredTimeSlot === "morning" ? "Morning (9 AM – 11 AM)" : preferredTimeSlot === "afternoon" ? "Afternoon (1 PM – 3 PM)" : "Evening (4 PM – 6 PM)"}</p>
          </div>

          {/* What happens next */}
          <div style={{ textAlign: "left", marginBottom: 28 }}>
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>What happens next</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(routingPath === "site_visit" ? NEXT_STEPS_SITE_VISIT : NEXT_STEPS_REMOTE).map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 28, height: 28, borderRadius: "50%", background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2563eb" }}>
                    {i + 1}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{step.title}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Link
            href="/"
            style={{ display: "inline-block", padding: "10px 24px", background: "#2563eb", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const canProceedStep1 = serviceCategory.trim() !== "" && serviceDescription.trim().length >= 10;
  const canProceedStep2 =
    name.trim() !== "" &&
    (email.trim() !== "" || phone.trim() !== "") &&
    (preferredContact !== "sms" || (phone.trim() !== "" && smsConsent));
  const canProceedStep3 = address.trim() !== "" && preferredDate !== "";

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "32px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* Brand header */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <BookingLogo />
        </div>

        {/* Page title */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Request Service</h1>
          <p style={{ color: "#6b7280", fontSize: 15, margin: 0 }}>Tell us what you need and we&apos;ll confirm the details before scheduling.</p>
        </div>

        {/* How it works — collapsed blurb */}
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          {NEXT_STEPS_REMOTE.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#1d4ed8" }}>
              <span style={{ fontWeight: 700, background: "#2563eb", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
              <span>{step.title}</span>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 32 }}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                width: 32, height: 4, borderRadius: 2,
                background: s <= step ? "#2563eb" : "#e5e7eb",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 24, color: "#991b1b" }}>
            {error}
          </div>
        )}

        {/* Step 1: Service */}
        {step === 1 && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>What do you need help with?</h2>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              {serviceCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setServiceCategory(cat.id)}
                  style={{
                    padding: "12px 16px",
                    border: serviceCategory === cat.id ? "2px solid #2563eb" : "1px solid #e5e7eb",
                    borderRadius: 8,
                    background: serviceCategory === cat.id ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{cat.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{cat.label}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{cat.description}</div>
                </button>
              ))}
            </div>

            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>Describe the work needed</span>
              <textarea
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                placeholder="e.g. Paint the living room and hallway, patch two small holes in the drywall first"
                rows={4}
                style={{
                  width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8,
                  fontSize: 15, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit",
                }}
              />
              <span style={{ fontSize: 12, color: serviceDescription.length >= 10 ? "#6b7280" : "#dc2626" }}>
                {serviceDescription.length}/2000 characters (min 10)
              </span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={!canProceedStep1}
                onClick={() => setStep(2)}
                style={{
                  padding: "10px 24px", background: canProceedStep1 ? "#2563eb" : "#e5e7eb",
                  color: canProceedStep1 ? "#fff" : "#9ca3af", border: "none", borderRadius: 8,
                  fontSize: 15, fontWeight: 600, cursor: canProceedStep1 ? "pointer" : "default",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Contact Info */}
        {step === 2 && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Your Contact Info</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>Full name *</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "block" }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "block" }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>Phone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
                />
              </label>

              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                We need at least one way to reach you (email or phone).
              </p>

              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Preferred contact method</legend>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {([
                    ["email", "Email"],
                    ["sms", "SMS"],
                    ["phone", "Phone"],
                  ] as const).map(([value, label]) => (
                    <label
                      key={value}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        border: preferredContact === value ? "2px solid #2563eb" : "1px solid #d1d5db",
                        borderRadius: 8,
                        background: preferredContact === value ? "#eff6ff" : "#fff",
                        cursor: "pointer",
                        fontSize: 14,
                        fontWeight: preferredContact === value ? 600 : 400,
                      }}
                    >
                      <input
                        type="radio"
                        name="preferred_contact"
                        value={value}
                        checked={preferredContact === value}
                        onChange={() => {
                          setPreferredContact(value);
                          if (value !== "sms") setSmsConsent(false);
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {preferredContact === "sms" && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, border: "1px solid #d1d5db", borderRadius: 8, background: "#f9fafb" }}>
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.45 }}>
                    {SMS_CONSENT_TEXT}
                  </span>
                </label>
              )}
            </div>

            {/* Referral source — optional */}
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>How did you hear about us? <span style={{ fontWeight: 400, color: "#6b7280" }}>(optional)</span></p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {([
                  ["online", "Found us online"],
                  ["friend_neighbor", "Friend or neighbor"],
                  ["realtor", "Realtor referral"],
                  ["repeat", "Previous client"],
                  ["other", "Other"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setReferralSource(referralSource === value ? "" : value)}
                    style={{
                      padding: "7px 14px",
                      border: referralSource === value ? "2px solid #2563eb" : "1px solid #d1d5db",
                      borderRadius: 20,
                      background: referralSource === value ? "#eff6ff" : "#fff",
                      color: referralSource === value ? "#2563eb" : "#374151",
                      fontWeight: referralSource === value ? 600 : 400,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {referralSource === "realtor" && (
                <input
                  type="text"
                  value={referralName}
                  onChange={(e) => setReferralName(e.target.value)}
                  placeholder="Realtor name or company"
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
                />
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{ padding: "10px 20px", background: "none", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer", fontSize: 15 }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={!canProceedStep2}
                onClick={() => setStep(3)}
                style={{
                  padding: "10px 24px", background: canProceedStep2 ? "#2563eb" : "#e5e7eb",
                  color: canProceedStep2 ? "#fff" : "#9ca3af", border: "none", borderRadius: 8,
                  fontSize: 15, fontWeight: 600, cursor: canProceedStep2 ? "pointer" : "default",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Location & preferred timing */}
        {step === 3 && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Location & Preferred Timing</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>Street address *</span>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St"
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>City</span>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
                  />
                </label>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>State</span>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="ST"
                    maxLength={2}
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
                  />
                </label>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>ZIP</span>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    placeholder="12345"
                    maxLength={10}
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
                  />
                </label>
              </div>

              <label style={{ display: "block" }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>Preferred date *</span>
                <input
                  type="date"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  min={today}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "block" }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>Preferred time</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["morning", "afternoon", "evening"] as const).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setPreferredTimeSlot(slot)}
                      style={{
                        flex: 1, padding: "8px 12px", border: preferredTimeSlot === slot ? "2px solid #2563eb" : "1px solid #d1d5db",
                        borderRadius: 6, background: preferredTimeSlot === slot ? "#eff6ff" : "#fff",
                        cursor: "pointer", fontSize: 13, fontWeight: preferredTimeSlot === slot ? 600 : 400,
                        color: preferredTimeSlot === slot ? "#2563eb" : "#374151",
                      }}
                    >
                      {slot === "morning" ? "🌅 Morning" : slot === "afternoon" ? "☀️ Afternoon" : "🌆 Evening"}
                    </button>
                  ))}
                </div>
              </label>

              <label style={{ display: "block" }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 6 }}>Access notes (optional)</span>
                <input
                  type="text"
                  value={accessNotes}
                  onChange={(e) => setAccessNotes(e.target.value)}
                  placeholder="Gate code, parking instructions, pet info..."
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }}
                />
              </label>
            </div>

            {/* Summary */}
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Summary</p>
              <p style={{ fontSize: 13, margin: "0 0 4px", color: "#374151" }}>
                <strong>Service:</strong> {serviceCategories.find((c) => c.id === serviceCategory)?.label}
              </p>
              <p style={{ fontSize: 13, margin: 0, color: "#374151" }}>
                <strong>Contact:</strong> {name} — {email || phone || "none"}
              </p>
              <p style={{ fontSize: 13, margin: "4px 0 0", color: "#374151" }}>
                <strong>Preferred contact:</strong> {preferredContact.toUpperCase()}
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                style={{ padding: "10px 20px", background: "none", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer", fontSize: 15 }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={!canProceedStep3 || submitting}
                onClick={handleSubmit}
                style={{
                  padding: "10px 32px", background: canProceedStep3 && !submitting ? "#2563eb" : "#e5e7eb",
                  color: canProceedStep3 && !submitting ? "#fff" : "#9ca3af", border: "none", borderRadius: 8,
                  fontSize: 15, fontWeight: 600, cursor: canProceedStep3 && !submitting ? "pointer" : "default",
                }}
              >
                {submitting ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
