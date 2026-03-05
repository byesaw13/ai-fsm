/**
 * Database helpers for the document_links table.
 *
 * document_links stores the mapping between ai-fsm entities and
 * Paperless-ngx document IDs.  ai-fsm owns this data; Paperless is
 * consulted only to enrich the display (title, filename).
 */

import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// RLS context helper (mirrors withExpenseContext)
// ---------------------------------------------------------------------------

export async function withDocumentContext<T>(
  session: SessionPayload,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [session.userId]);
    await client.query("SELECT set_config('app.current_account_id', $1, true)", [session.accountId]);
    await client.query("SELECT set_config('app.current_role', $1, true)", [session.role]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export interface DocumentLinkRow {
  id: string;
  entity_type: string;
  entity_id: string;
  paperless_doc_id: number;
  title: string | null;
  original_filename: string | null;
  created_by: string;
  created_at: string;
}

/**
 * Return all document links for a given entity (by type + id).
 * Ordered newest-first.
 */
export async function listDocumentLinks(
  client: PoolClient,
  accountId: string,
  entityType: string,
  entityId: string
): Promise<DocumentLinkRow[]> {
  const { rows } = await client.query<DocumentLinkRow>(
    `SELECT id, entity_type, entity_id, paperless_doc_id,
            title, original_filename, created_by, created_at
     FROM document_links
     WHERE account_id = $1
       AND entity_type = $2
       AND entity_id = $3
     ORDER BY created_at DESC`,
    [accountId, entityType, entityId]
  );
  return rows;
}

/**
 * Return a single document link by id, or null if not found.
 */
export async function getDocumentLink(
  client: PoolClient,
  accountId: string,
  linkId: string
): Promise<DocumentLinkRow | null> {
  const { rows } = await client.query<DocumentLinkRow>(
    `SELECT id, entity_type, entity_id, paperless_doc_id,
            title, original_filename, created_by, created_at
     FROM document_links
     WHERE id = $1 AND account_id = $2`,
    [linkId, accountId]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

export interface CreateDocumentLinkInput {
  entityType: string;
  entityId: string;
  paperlessDocId: number;
  title?: string | null;
  originalFilename?: string | null;
  createdBy: string;
}

/**
 * Insert a new document_links row.
 * Throws with code '23505' (UNIQUE_VIOLATION) if the link already exists.
 */
export async function createDocumentLink(
  client: PoolClient,
  accountId: string,
  input: CreateDocumentLinkInput
): Promise<DocumentLinkRow> {
  const { rows } = await client.query<DocumentLinkRow>(
    `INSERT INTO document_links
       (account_id, entity_type, entity_id, paperless_doc_id,
        title, original_filename, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, entity_type, entity_id, paperless_doc_id,
               title, original_filename, created_by, created_at`,
    [
      accountId,
      input.entityType,
      input.entityId,
      input.paperlessDocId,
      input.title ?? null,
      input.originalFilename ?? null,
      input.createdBy,
    ]
  );
  return rows[0];
}

/**
 * Delete a document link by id.
 * Returns true if a row was deleted, false if not found.
 */
export async function deleteDocumentLink(
  client: PoolClient,
  accountId: string,
  linkId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM document_links WHERE id = $1 AND account_id = $2`,
    [linkId, accountId]
  );
  return (rowCount ?? 0) > 0;
}
