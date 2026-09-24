"use client";

import { useState } from "react";
import { Button, Input, Select, Textarea, useToast } from "@/components/ui";
import { PROPERTY_CONTACT_ROLES } from "@/lib/properties/contacts";

export type PropertyContactRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  external_name: string | null;
  external_email: string | null;
  external_phone: string | null;
  notes: string | null;
  role: (typeof PROPERTY_CONTACT_ROLES)[number];
};

type ContactForm = Omit<PropertyContactRow, "id" | "client_name" | "client_email" | "client_phone">;
const BLANK: ContactForm = { client_id: null, external_name: null, external_email: null, external_phone: null, notes: null, role: "beneficiary" };

export function PropertyContactsPanel({
  propertyId,
  initialContacts,
  clients,
}: {
  propertyId: string;
  initialContacts: PropertyContactRow[];
  clients: { id: string; name: string }[];
}) {
  const toast = useToast();
  const [contacts, setContacts] = useState(initialContacts);
  const [form, setForm] = useState<ContactForm>(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function startEdit(contact: PropertyContactRow) {
    setEditingId(contact.id);
    setForm({
      client_id: contact.client_id,
      external_name: contact.external_name,
      external_email: contact.external_email,
      external_phone: contact.external_phone,
      notes: contact.notes,
      role: contact.role,
    });
    setOpen(true);
  }

  async function save() {
    setPending(true);
    try {
      const response = await fetch(
        editingId ? `/api/v1/properties/${propertyId}/contacts/${editingId}` : `/api/v1/properties/${propertyId}/contacts`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error?.message ?? "Failed to save contact");
      const client = clients.find((item) => item.id === body.data.client_id);
      const row = { ...body.data, client_name: client?.name ?? null, client_email: null, client_phone: null } as PropertyContactRow;
      setContacts((current) => editingId ? current.map((item) => item.id === editingId ? row : item) : [...current, row]);
      setForm(BLANK);
      setEditingId(null);
      setOpen(false);
      toast.success(editingId ? "Contact updated" : "Contact added");
    } catch {
      toast.error("Failed to save contact");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      const response = await fetch(`/api/v1/properties/${propertyId}/contacts/${id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error?.message ?? "Failed to delete contact");
      setContacts((current) => current.filter((item) => item.id !== id));
      toast.success("Contact deleted");
    } catch {
      toast.error("Failed to delete contact");
    } finally {
      setPending(false);
    }
  }

  const registered = Boolean(form.client_id);
  return (
    <div data-testid="property-contacts-panel">
      {contacts.map((contact) => (
        <div key={contact.id} style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "start" }}>
            <div>
              <strong>{contact.client_name ?? contact.external_name}</strong>
              <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>{contact.role.replaceAll("_", " ")}</div>
              {(contact.client_email ?? contact.external_email) ? <div>{contact.client_email ?? contact.external_email}</div> : null}
              {(contact.client_phone ?? contact.external_phone) ? <div>{contact.client_phone ?? contact.external_phone}</div> : null}
              {contact.notes ? <div style={{ whiteSpace: "pre-wrap", marginTop: "var(--space-1)" }}>{contact.notes}</div> : null}
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(contact)}>Edit</Button>
              <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => remove(contact.id)}>Delete</Button>
            </div>
          </div>
        </div>
      ))}

      {open ? (
        <div className="p7-form-grid p7-form-grid-2" style={{ marginTop: "var(--space-4)" }}>
          <Select
            id="property-contact-client"
            label="Registered client"
            value={form.client_id ?? ""}
            placeholder="Use an external contact"
            options={clients.map((client) => ({ value: client.id, label: client.name }))}
            onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value || null, external_name: null, external_email: null, external_phone: null }))}
          />
          <Select
            id="property-contact-role"
            label="Role"
            value={form.role}
            options={PROPERTY_CONTACT_ROLES.map((role) => ({ value: role, label: role.replaceAll("_", " ") }))}
            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as ContactForm["role"] }))}
          />
          {!registered ? (
            <>
              <Input id="property-contact-name" required label="External name" value={form.external_name ?? ""} onChange={(event) => setForm((current) => ({ ...current, external_name: event.target.value || null }))} />
              <Input id="property-contact-email" type="email" label="Email" value={form.external_email ?? ""} onChange={(event) => setForm((current) => ({ ...current, external_email: event.target.value || null }))} />
              <Input id="property-contact-phone" label="Phone" value={form.external_phone ?? ""} onChange={(event) => setForm((current) => ({ ...current, external_phone: event.target.value || null }))} />
            </>
          ) : null}
          <Textarea id="property-contact-notes" label="Notes" rows={2} value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value || null }))} containerClassName="p7-form-grid-span-2" />
          <div className="p7-form-grid-span-2" style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button type="button" loading={pending} onClick={save}>{editingId ? "Save contact" : "Add contact"}</Button>
            <Button type="button" variant="secondary" onClick={() => { setOpen(false); setEditingId(null); setForm(BLANK); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} style={{ marginTop: "var(--space-3)" }}>+ Add contact</Button>
      )}
    </div>
  );
}
