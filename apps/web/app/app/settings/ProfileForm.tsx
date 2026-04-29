"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface Props {
  userId: string;
  initialName: string;
  initialEmail: string;
  initialPhone: string | null;
  role: string;
}

export function ProfileForm({ userId, initialName, initialEmail, initialPhone, role }: Props) {
  const { success, error } = useToast();

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const canEditEmail = role !== "tech";

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const body: Record<string, string> = { full_name: name, phone };
      if (canEditEmail) body.email = email;
      const res = await fetch(`/api/v1/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { error(data.error?.message ?? "Save failed"); return; }
      success("Profile updated");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== newPw2) { error("New passwords do not match"); return; }
    setSavingPw(true);
    try {
      const res = await fetch(`/api/v1/users/${userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) { error(data.error?.message ?? "Password change failed"); return; }
      setCurrentPw(""); setNewPw(""); setNewPw2("");
      success("Password updated");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <form onSubmit={handleProfileSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="profile-name">Full name</label>
            <input id="profile-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="profile-phone">Phone</label>
            <input id="profile-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} />
          </div>
          {canEditEmail && (
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="profile-email">Email</label>
              <input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
          )}
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>

      <div style={{ borderTop: "1px solid var(--color-border, #e4e4e7)", paddingTop: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Change password</div>
        <form onSubmit={handlePasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="current-pw">Current password</label>
              <input id="current-pw" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="new-pw">New password</label>
              <input id="new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="new-pw2">Confirm new password</label>
              <input id="new-pw2" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={savingPw}>
              {savingPw ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
