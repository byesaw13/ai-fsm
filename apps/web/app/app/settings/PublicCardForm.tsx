"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { resolvePublicCard, toE164, type PublicCardSettings } from "@/lib/company/public-card";

interface Props {
  initialSettings: Partial<PublicCardSettings>;
}

const REBUILD_MESSAGE: Record<string, string> = {
  queued: "Saved. The website and your card update in about 2 minutes.",
  not_configured: "Saved. The website isn't connected yet, so it updates on its next deploy.",
  failed: "Saved, but the website rebuild didn't start. It updates on its next deploy.",
};

/** TASK-177: the info on mydovetails.com, /card, and the saved contact. */
export function PublicCardForm({ initialSettings }: Props) {
  const { success, error } = useToast();
  // Start from what the website shows now, including its fallbacks.
  const live = resolvePublicCard(initialSettings);
  const [firstName, setFirstName] = useState(live.firstName);
  const [lastName, setLastName] = useState(live.lastName);
  const [nickname, setNickname] = useState(live.nickname);
  const [title, setTitle] = useState(live.title);
  const [phone, setPhone] = useState(live.phoneDisplay);
  const [email, setEmail] = useState(live.email);
  const [location, setLocation] = useState(live.location);
  const [serviceArea, setServiceArea] = useState(live.serviceArea);
  const [badges, setBadges] = useState([0, 1, 2].map((i) => live.badges[i] ?? ""));
  const [saving, setSaving] = useState(false);

  const phoneOk = toE164(phone) !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneOk) {
      error("Enter a 10-digit US phone number");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            card_first_name: firstName,
            card_last_name: lastName,
            card_nickname: nickname,
            card_title: title,
            company_phone: phone,
            company_email: email,
            card_location: location,
            card_service_area: serviceArea,
            card_badges: badges.map((b) => b.trim()).filter(Boolean),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error?.message ?? "Save failed");
        return;
      }
      success(REBUILD_MESSAGE[data.site_rebuild] ?? "Saved");
    } finally {
      setSaving(false);
    }
  }

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    opts: { type?: string; max?: number; required?: boolean } = {},
  ) => (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={opts.type ?? "text"}
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={opts.max ?? 80}
        required={opts.required}
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        {field("card-first", "First name (saved contact)", firstName, setFirstName, { required: true })}
        {field("card-last", "Last name", lastName, setLastName, { required: true })}
        {field("card-nick", "Name you go by", nickname, setNickname, { required: true })}
        {field("card-title", "Title", title, setTitle, { required: true })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <div className="form-group">
          <label htmlFor="card-phone">Business phone</label>
          <input
            id="card-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={50}
            required
            aria-invalid={!phoneOk}
          />
          {!phoneOk && <small style={{ color: "var(--danger, #b42318)" }}>Enter a 10-digit US number.</small>}
        </div>
        {field("card-email", "Business email", email, setEmail, { type: "email", max: 255, required: true })}
        {field("card-location", "Based in", location, setLocation, { required: true })}
        {field("card-area", "Serving", serviceArea, setServiceArea, { max: 120, required: true })}
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 8 }}>Badges on the card (up to 3)</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          {badges.map((b, i) => (
            <input
              key={i}
              aria-label={`Badge ${i + 1}`}
              type="text"
              value={b}
              maxLength={30}
              onChange={(e) => setBadges(badges.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
        </div>
      </fieldset>
      <small style={{ color: "var(--fg-muted)" }}>
        Shown on mydovetails.com, your card page at mydovetails.com/card, and the contact people save
        from it. Phone and email also print on estimates and invoices.
      </small>
      <div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save and update website"}
        </button>
      </div>
    </form>
  );
}
