import type { PoolClient } from "pg";
import { normalizePhone } from "@/lib/phone";

export const SMS_CONSENT_TEXT =
  "By checking this box you consent to receive text messages from Dovetails Services LLC about your service requests. Message & data rates may apply. Reply STOP to opt out.";

type PreferredContact = "sms" | "email" | "phone";

export type IntakeRecordInput = {
  accountId: string;
  createdByUserId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  serviceCategory: string;
  serviceDescription: string;
  preferredDate: string;
  preferredTimeSlot?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  accessNotes?: string | null;
  preferredContact: PreferredContact;
  smsConsent: boolean;
  smsConsentSource: string;
  routingPath?: "site_visit" | "remote_estimate" | "pending";
  walkthroughScore?: number | null;
  referralSource?: "online" | "friend_neighbor" | "realtor" | "repeat" | "other" | null;
  referralName?: string | null;
  intakeMetadata?: Record<string, string> | null;
};

export type IntakeRecordResult = {
  bookingId: string;
  clientId: string;
  propertyId: string;
  jobId: string;
  routingPath: "site_visit" | "remote_estimate" | "pending";
};

export type ExistingBookingRequestInput = {
  id: string;
  accountId: string;
  createdByUserId: string;
  clientId?: string | null;
  propertyId?: string | null;
  jobId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  serviceCategory: string;
  serviceDescription?: string | null;
  preferredDate: string;
  preferredTimeSlot?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  accessNotes?: string | null;
  preferredContact?: PreferredContact | null;
  smsConsent?: boolean | null;
};

const JOB_TYPE_BY_CATEGORY: Record<string, string> = {
  painting_finishes: "painting",
  maintenance_small: "maintenance",
  general_repairs: "repair",
  plumbing: "plumbing",
  electrical: "electrical",
  carpentry_furniture: "carpentry",
  outdoor_seasonal: "landscaping",
  mounting_installs: "custom",
  specialty_expansion: "custom",
};

function titleCaseCategory(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function resolveCreatedByUserId(
  client: PoolClient,
  accountId: string,
  userId?: string | null
): Promise<string> {
  if (userId) return userId;

  const { rows } = await client.query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE account_id = $1
       AND role IN ('owner', 'admin')
     ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`,
    [accountId]
  );

  if (!rows[0]?.id) {
    throw new Error("No owner or admin user is available to own intake-created jobs");
  }

  return rows[0].id;
}

async function findOrCreateClient(
  client: PoolClient,
  input: IntakeRecordInput
): Promise<string> {
  let clientId: string | null = null;
  // Normalize to E.164 so the same person always maps to one record.
  const normalizedPhone = normalizePhone(input.phone) ?? input.phone ?? null;

  if (input.email) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM clients WHERE account_id = $1 AND email = $2`,
      [input.accountId, input.email]
    );
    clientId = rows[0]?.id ?? null;
  }

  if (!clientId && normalizedPhone) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM clients WHERE account_id = $1 AND phone = $2`,
      [input.accountId, normalizedPhone]
    );
    clientId = rows[0]?.id ?? null;
  }

  if (!clientId) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO clients (
         account_id, name, email, phone, preferred_contact,
         sms_consent, sms_consent_at, sms_consent_source, sms_consent_text
       )
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN NOW() ELSE NULL END, $7, $8)
       RETURNING id`,
      [
        input.accountId,
        input.name,
        input.email || null,
        normalizedPhone || null,
        input.preferredContact,
        input.smsConsent,
        input.smsConsent ? input.smsConsentSource : null,
        input.smsConsent ? SMS_CONSENT_TEXT : null,
      ]
    );
    return rows[0].id;
  }

  await client.query(
    `UPDATE clients
     SET preferred_contact = $2,
         sms_consent = CASE WHEN $3 THEN true ELSE sms_consent END,
         sms_consent_at = CASE WHEN $3 THEN NOW() ELSE sms_consent_at END,
         sms_consent_source = CASE WHEN $3 THEN $4 ELSE sms_consent_source END,
         sms_consent_text = CASE WHEN $3 THEN $5 ELSE sms_consent_text END
     WHERE id = $1 AND account_id = $6`,
    [
      clientId,
      input.preferredContact,
      input.smsConsent,
      input.smsConsentSource,
      SMS_CONSENT_TEXT,
      input.accountId,
    ]
  );

  return clientId;
}

async function findOrCreateProperty(
  client: PoolClient,
  input: IntakeRecordInput,
  clientId: string
): Promise<string> {
  const { rows: existingRows } = await client.query<{ id: string }>(
    `SELECT id FROM properties WHERE client_id = $1 AND address = $2`,
    [clientId, input.address]
  );

  if (existingRows[0]?.id) return existingRows[0].id;

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO properties (account_id, client_id, name, address, city, state, zip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.accountId,
      clientId,
      input.address,
      input.address,
      input.city || null,
      input.state || null,
      input.zip || null,
    ]
  );

  return rows[0].id;
}

async function updateDuplicateCandidates(
  client: PoolClient,
  input: IntakeRecordInput,
  bookingId: string
): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM booking_requests
     WHERE account_id = $1
       AND id != $2
       AND status NOT IN ('cancelled','converted')
       AND created_at > NOW() - INTERVAL '90 days'
       AND (
         (email IS NOT NULL AND email = $3) OR
         (phone IS NOT NULL AND phone = $4) OR
         (lower(name) = lower($5))
       )
     LIMIT 5`,
    [
      input.accountId,
      bookingId,
      input.email || null,
      input.phone || null,
      input.name,
    ]
  );

  if (rows.length === 0) return;

  await client.query(
    `UPDATE booking_requests
     SET duplicate_candidate_ids = $1
     WHERE id = $2 AND account_id = $3`,
    [rows.map((row) => row.id), bookingId, input.accountId]
  );
}

export async function createIntakeRecords(
  client: PoolClient,
  input: IntakeRecordInput
): Promise<IntakeRecordResult> {
  const createdByUserId = await resolveCreatedByUserId(
    client,
    input.accountId,
    input.createdByUserId
  );
  const clientId = await findOrCreateClient(client, input);
  const propertyId = await findOrCreateProperty(client, input, clientId);

  const jobType = JOB_TYPE_BY_CATEGORY[input.serviceCategory] || "custom";
  const categoryLabel = titleCaseCategory(input.serviceCategory);

  const { rows: jobRows } = await client.query<{ id: string }>(
    `INSERT INTO jobs (account_id, client_id, property_id, title, description, status, job_type, created_by)
     VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
     RETURNING id`,
    [
      input.accountId,
      clientId,
      propertyId,
      `${categoryLabel} - ${input.name}`,
      input.serviceDescription,
      jobType,
      createdByUserId,
    ]
  );
  const jobId = jobRows[0].id;

  const routingPath = input.routingPath ?? "pending";

  const { rows: bookingRows } = await client.query<{ id: string }>(
    `INSERT INTO booking_requests
       (account_id, client_id, property_id, job_id,
        name, email, phone, service_category, service_description,
        preferred_date, preferred_time_slot, address, city, state, zip, access_notes,
        preferred_contact, sms_consent, sms_consent_at, sms_consent_source,
        routing_path, walkthrough_score, referral_source, referral_name, intake_metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, CASE WHEN $18 THEN NOW() ELSE NULL END, CASE WHEN $18 THEN $19 ELSE NULL END,
             $20, $21, $22, $23, $24)
     RETURNING id`,
    [
      input.accountId,
      clientId,
      propertyId,
      jobId,
      input.name,
      input.email || null,
      input.phone || null,
      input.serviceCategory,
      input.serviceDescription,
      input.preferredDate,
      input.preferredTimeSlot || null,
      input.address,
      input.city || null,
      input.state || null,
      input.zip || null,
      input.accessNotes || null,
      input.preferredContact,
      input.smsConsent,
      input.smsConsentSource,
      routingPath,
      input.walkthroughScore ?? null,
      input.referralSource ?? null,
      input.referralName ?? null,
      input.intakeMetadata ? JSON.stringify(input.intakeMetadata) : null,
    ]
  );
  const bookingId = bookingRows[0].id;

  await updateDuplicateCandidates(client, input, bookingId);

  return {
    bookingId,
    clientId,
    propertyId,
    jobId,
    routingPath,
  };
}

export async function repairBookingRequestPipelineLinks(
  client: PoolClient,
  input: ExistingBookingRequestInput
): Promise<IntakeRecordResult> {
  const normalized: IntakeRecordInput = {
    accountId: input.accountId,
    createdByUserId: input.createdByUserId,
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    serviceCategory: input.serviceCategory,
    serviceDescription: input.serviceDescription || "Intake request created before project linking was enabled.",
    preferredDate: input.preferredDate,
    preferredTimeSlot: input.preferredTimeSlot || null,
    address: input.address,
    city: input.city || null,
    state: input.state || null,
    zip: input.zip || null,
    accessNotes: input.accessNotes || null,
    preferredContact: input.preferredContact || (input.phone ? "phone" : "email"),
    smsConsent: !!input.smsConsent,
    smsConsentSource: "orphan_repair",
  };

  const clientId = input.clientId || await findOrCreateClient(client, normalized);
  const propertyId = input.propertyId || await findOrCreateProperty(client, normalized, clientId);
  let jobId = input.jobId ?? null;

  if (!jobId) {
    const jobType = JOB_TYPE_BY_CATEGORY[normalized.serviceCategory] || "custom";
    const categoryLabel = titleCaseCategory(normalized.serviceCategory);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO jobs (account_id, client_id, property_id, title, description, status, job_type, created_by)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
       RETURNING id`,
      [
        normalized.accountId,
        clientId,
        propertyId,
        `${categoryLabel} - ${normalized.name}`,
        normalized.serviceDescription,
        jobType,
        normalized.createdByUserId,
      ]
    );
    jobId = rows[0].id;
  }

  await client.query(
    `UPDATE booking_requests
     SET client_id = $3,
         property_id = $4,
         job_id = $5,
         updated_at = now()
     WHERE id = $1 AND account_id = $2`,
    [input.id, input.accountId, clientId, propertyId, jobId]
  );

  return {
    bookingId: input.id,
    clientId,
    propertyId,
    jobId,
    routingPath: "pending" as const,
  };
}
