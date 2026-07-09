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

/** Subquery: client's earliest property when document has no explicit link. */
const CLIENT_FIRST_PROPERTY = `(
  SELECT p2.id
  FROM properties p2
  WHERE p2.client_id = c.id AND p2.account_id = i.account_id
  ORDER BY p2.created_at ASC
  LIMIT 1
)`;

/** SQL fragment: join chain that resolves property from invoice → job → estimate → client. */
export const INVOICE_DOCUMENT_JOINS = `
  JOIN clients c ON c.id = i.client_id
  LEFT JOIN jobs j ON j.id = i.job_id
  LEFT JOIN estimates e ON e.id = i.estimate_id
  LEFT JOIN properties p ON p.id = COALESCE(i.property_id, j.property_id, e.property_id, ${CLIENT_FIRST_PROPERTY})
`;

export const INVOICE_LOCATION_SELECT = `
  c.name AS client_name,
  c.email AS client_email,
  c.phone AS client_phone,
  c.address_line1 AS client_address_line1,
  c.city AS client_city,
  c.state AS client_state,
  c.zip AS client_zip,
  j.property_id AS job_property_id,
  e.property_id AS estimate_property_id,
  p.id AS resolved_property_id,
  p.address AS property_address,
  p.city AS property_city,
  p.state AS property_state,
  p.zip AS property_zip
`;

const ESTIMATE_CLIENT_FIRST_PROPERTY = `(
  SELECT p2.id
  FROM properties p2
  WHERE p2.client_id = c.id AND p2.account_id = e.account_id
  ORDER BY p2.created_at ASC
  LIMIT 1
)`;

export const ESTIMATE_DOCUMENT_JOINS = `
  JOIN clients c ON c.id = e.client_id
  LEFT JOIN jobs j ON j.id = e.job_id
  LEFT JOIN properties p ON p.id = COALESCE(e.property_id, j.property_id, ${ESTIMATE_CLIENT_FIRST_PROPERTY})
`;

export const ESTIMATE_LOCATION_SELECT = `
  c.name AS client_name,
  c.email AS client_email,
  c.phone AS client_phone,
  c.address_line1 AS client_address_line1,
  c.city AS client_city,
  c.state AS client_state,
  c.zip AS client_zip,
  j.property_id AS job_property_id,
  p.id AS resolved_property_id,
  p.address AS property_address,
  p.city AS property_city,
  p.state AS property_state,
  p.zip AS property_zip
`;