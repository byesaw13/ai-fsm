export type LocationSource =
  | "document"
  | "job"
  | "estimate"
  | "client_property"
  | "client_billing"
  | "missing";

export function deriveLocationSource(fields: {
  document_property_id: string | null;
  job_property_id: string | null;
  estimate_property_id?: string | null;
  resolved_property_id: string | null;
  service_location: string;
}): LocationSource {
  const { document_property_id, job_property_id, estimate_property_id, resolved_property_id, service_location } = fields;

  if (service_location === "Address not on file") return "missing";
  if (document_property_id && document_property_id === resolved_property_id) return "document";
  if (job_property_id && job_property_id === resolved_property_id) return "job";
  if (estimate_property_id && estimate_property_id === resolved_property_id) return "estimate";
  if (resolved_property_id) return "client_property";
  return "client_billing";
}

export function locationSourceLabel(source: LocationSource): string {
  switch (source) {
    case "document":
      return "On this document";
    case "job":
      return "From linked project";
    case "estimate":
      return "From linked estimate";
    case "client_property":
      return "From client property";
    case "client_billing":
      return "Client billing address";
    case "missing":
      return "Not set — tap to link";
  }
}

export function formatPropertyOption(
  address: string | null,
  city: string | null,
  state: string | null,
  zip: string | null,
  title?: string | null,
): string {
  const parts = [address?.trim(), [city?.trim(), state?.trim()].filter(Boolean).join(", "), zip?.trim()].filter(Boolean);
  const addr = parts.join(", ");
  if (title?.trim()) return `${title.trim()} — ${addr || "No address"}`;
  return addr || "No address";
}