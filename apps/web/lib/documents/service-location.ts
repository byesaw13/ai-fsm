/** Fields used to resolve a service location for invoices/estimates. */
export interface LocationFields {
  property_address?: string | null;
  property_city?: string | null;
  property_state?: string | null;
  property_zip?: string | null;
  client_address_line1?: string | null;
  client_city?: string | null;
  client_state?: string | null;
  client_zip?: string | null;
}

export function formatAddressLine(
  line1: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string | null {
  const street = line1?.trim();
  const cityState = [city?.trim(), state?.trim()].filter(Boolean).join(", ");
  const parts = [street, cityState, zip?.trim()].filter((p) => p && p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Property address first, then client billing address. Never returns empty. */
export function resolveServiceLocation(fields: LocationFields): string {
  const fromProperty = formatAddressLine(
    fields.property_address,
    fields.property_city,
    fields.property_state,
    fields.property_zip,
  );
  if (fromProperty) return fromProperty;

  const fromClient = formatAddressLine(
    fields.client_address_line1,
    fields.client_city,
    fields.client_state,
    fields.client_zip,
  );
  if (fromClient) return fromClient;

  return "Address not on file";
}

/**
 * Client + property columns for document letterhead / print / PDF loaders.
 * Includes resolved property id + job (and optionally estimate) property ids.
 */
export function documentLocationSelect(opts: {
  /** When true (invoice joins), also select estimate.property_id. */
  includeEstimateProperty?: boolean;
} = {}): string {
  const estimateCol = opts.includeEstimateProperty
    ? `\n  e.property_id AS estimate_property_id,`
    : "";
  return `
  c.name AS client_name,
  c.email AS client_email,
  c.phone AS client_phone,
  c.address_line1 AS client_address_line1,
  c.city AS client_city,
  c.state AS client_state,
  c.zip AS client_zip,
  j.property_id AS job_property_id,${estimateCol}
  p.id AS resolved_property_id,
  p.address AS property_address,
  p.city AS property_city,
  p.state AS property_state,
  p.zip AS property_zip
`;
}

/**
 * Join chain from document root → client → job → optional estimate → property.
 * root "i" = invoices alias; root "e" = estimates alias.
 */
export function documentJoins(opts: {
  root: "i" | "e";
  /** When true (invoices), also COALESCE property via linked estimate. */
  includeEstimateProperty?: boolean;
}): string {
  const { root, includeEstimateProperty = false } = opts;
  const clientFirstProperty = `(
  SELECT p2.id
  FROM properties p2
  WHERE p2.client_id = c.id AND p2.account_id = ${root}.account_id
  ORDER BY p2.created_at ASC
  LIMIT 1
)`;

  const estimateJoin =
    includeEstimateProperty && root === "i"
      ? `\n  LEFT JOIN estimates e ON e.id = i.estimate_id`
      : "";

  const coalesceParts =
    includeEstimateProperty && root === "i"
      ? `${root}.property_id, j.property_id, e.property_id, ${clientFirstProperty}`
      : `${root}.property_id, j.property_id, ${clientFirstProperty}`;

  return `
  JOIN clients c ON c.id = ${root}.client_id
  LEFT JOIN jobs j ON j.id = ${root}.job_id${estimateJoin}
  LEFT JOIN properties p ON p.id = COALESCE(${coalesceParts})
`;
}

/** @deprecated Use documentJoins({ root: "i", includeEstimateProperty: true }) */
export const INVOICE_DOCUMENT_JOINS = documentJoins({
  root: "i",
  includeEstimateProperty: true,
});

/** @deprecated Use documentLocationSelect({ includeEstimateProperty: true }) */
export const INVOICE_LOCATION_SELECT = documentLocationSelect({
  includeEstimateProperty: true,
});

/** @deprecated Use documentJoins({ root: "e" }) */
export const ESTIMATE_DOCUMENT_JOINS = documentJoins({ root: "e" });

/** @deprecated Use documentLocationSelect() */
export const ESTIMATE_LOCATION_SELECT = documentLocationSelect();
