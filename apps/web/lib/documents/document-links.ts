import type { PoolClient } from "pg";
import { z } from "zod";

export const documentLinksBodySchema = z.object({
  client_id: z.string().uuid().optional(),
  location_mode: z.enum(["job", "property", "client_billing"]).optional(),
  job_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  new_property: z
    .object({
      address: z.string().min(1).max(500),
      city: z.string().max(100).optional().or(z.literal("")),
      state: z.string().max(100).optional().or(z.literal("")),
      zip: z.string().max(20).optional().or(z.literal("")),
    })
    .optional(),
});

export type DocumentLinksBody = z.infer<typeof documentLinksBodySchema>;

export async function assertClientInAccount(
  client: PoolClient,
  accountId: string,
  clientId: string,
): Promise<{ id: string; name: string }> {
  const result = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM clients WHERE id = $1 AND account_id = $2`,
    [clientId, accountId],
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error("Client not found"), { code: "NOT_FOUND" });
  }
  return result.rows[0];
}

export async function assertJobForClient(
  client: PoolClient,
  accountId: string,
  jobId: string,
  clientId: string,
): Promise<{ id: string; title: string; property_id: string | null }> {
  const result = await client.query<{ id: string; title: string; property_id: string | null }>(
    `SELECT id, title, property_id FROM jobs WHERE id = $1 AND account_id = $2 AND client_id = $3`,
    [jobId, accountId, clientId],
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error("Job not found for this client"), { code: "VALIDATION_ERROR" });
  }
  return result.rows[0];
}

export async function assertPropertyForClient(
  client: PoolClient,
  accountId: string,
  propertyId: string,
  clientId: string,
): Promise<{ id: string; address: string }> {
  const result = await client.query<{ id: string; address: string }>(
    `SELECT id, address FROM properties WHERE id = $1 AND account_id = $2 AND client_id = $3`,
    [propertyId, accountId, clientId],
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error("Property not found for this client"), { code: "VALIDATION_ERROR" });
  }
  return result.rows[0];
}

export async function createPropertyForClient(
  client: PoolClient,
  accountId: string,
  clientId: string,
  input: NonNullable<DocumentLinksBody["new_property"]>,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO properties (account_id, client_id, address, city, state, zip)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      accountId,
      clientId,
      input.address.trim(),
      input.city?.trim() || null,
      input.state?.trim() || null,
      input.zip?.trim() || null,
    ],
  );
  return result.rows[0].id;
}

export function resolveDocumentLinkPatch(
  body: DocumentLinksBody,
  current: { client_id: string; job_id: string | null; property_id: string | null },
  jobPropertyId: string | null,
): { client_id: string; job_id: string | null; property_id: string | null } {
  const clientId = body.client_id ?? current.client_id;
  let jobId = current.job_id;
  let propertyId = current.property_id;

  if (body.client_id && body.client_id !== current.client_id) {
    jobId = null;
    propertyId = null;
  }

  if (body.location_mode === "job") {
    jobId = body.job_id ?? null;
    propertyId = jobPropertyId;
  } else if (body.location_mode === "property") {
    propertyId = body.property_id ?? null;
  } else if (body.location_mode === "client_billing") {
    propertyId = null;
  }

  if (body.job_id !== undefined && body.location_mode !== "job") {
    jobId = body.job_id;
    if (body.property_id === undefined && jobPropertyId) {
      propertyId = jobPropertyId;
    }
  }

  if (body.property_id !== undefined && body.location_mode !== "property") {
    propertyId = body.property_id;
  }

  return { client_id: clientId, job_id: jobId, property_id: propertyId };
}