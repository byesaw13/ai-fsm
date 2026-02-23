export interface ClientLike {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface PropertyLike {
  name?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export function normalizeSearch(input?: string | null): string {
  return (input ?? "").trim().toLowerCase();
}

export function matchesSearch(fields: Array<string | null | undefined>, search?: string | null): boolean {
  const q = normalizeSearch(search);
  if (!q) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

export function formatClientContact(client: ClientLike): string {
  const parts = [client.email?.trim(), client.phone?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : "No contact details";
}

export function formatPropertyAddress(property: PropertyLike): string {
  const line1 = property.name?.trim() ? `${property.name.trim()} — ${property.address}` : property.address;
  const locality = [property.city?.trim(), property.state?.trim(), property.zip?.trim()]
    .filter(Boolean)
    .join(" ");
  return locality ? `${line1}, ${locality}` : line1;
}

export function buildJobCreateHref(clientId: string, propertyId?: string | null): string {
  const params = new URLSearchParams({ client_id: clientId });
  if (propertyId) params.set("property_id", propertyId);
  return `/app/jobs/new?${params.toString()}`;
}
