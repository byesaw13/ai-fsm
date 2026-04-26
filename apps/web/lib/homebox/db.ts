import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import type { AssetLinkStatus } from "@ai-fsm/domain";

export async function withAssetContext<T>(
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

export interface AssetLinkRow {
  id: string;
  entity_type: string;
  entity_id: string;
  homebox_item_id: string;
  cached_name: string | null;
  cached_location: string | null;
  status: AssetLinkStatus;
  created_by: string;
  created_at: string;
}

export async function listAssetLinks(
  client: PoolClient,
  accountId: string,
  entityType: string,
  entityId: string
): Promise<AssetLinkRow[]> {
  const res = await client.query<AssetLinkRow>(
    `SELECT id, entity_type, entity_id, homebox_item_id,
            cached_name, cached_location, status, created_by, created_at
     FROM asset_links
     WHERE account_id = $1 AND entity_type = $2 AND entity_id = $3
     ORDER BY created_at ASC`,
    [accountId, entityType, entityId]
  );
  return res.rows;
}

export async function createAssetLink(
  client: PoolClient,
  accountId: string,
  data: {
    entityType: string;
    entityId: string;
    homeboxItemId: string;
    cachedName: string | null;
    cachedLocation: string | null;
    createdBy: string;
  }
): Promise<AssetLinkRow> {
  const res = await client.query<AssetLinkRow>(
    `INSERT INTO asset_links
       (account_id, entity_type, entity_id, homebox_item_id,
        cached_name, cached_location, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7)
     RETURNING id, entity_type, entity_id, homebox_item_id,
               cached_name, cached_location, status, created_by, created_at`,
    [
      accountId,
      data.entityType,
      data.entityId,
      data.homeboxItemId,
      data.cachedName,
      data.cachedLocation,
      data.createdBy,
    ]
  );
  return res.rows[0];
}

export async function deleteAssetLink(
  client: PoolClient,
  accountId: string,
  linkId: string
): Promise<boolean> {
  const res = await client.query(
    `DELETE FROM asset_links WHERE id = $1 AND account_id = $2`,
    [linkId, accountId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function updateAssetLinkStatus(
  client: PoolClient,
  accountId: string,
  linkId: string,
  status: AssetLinkStatus
): Promise<AssetLinkRow | null> {
  const res = await client.query<AssetLinkRow>(
    `UPDATE asset_links
     SET status = $1
     WHERE id = $2 AND account_id = $3
     RETURNING id, entity_type, entity_id, homebox_item_id,
               cached_name, cached_location, status, created_by, created_at`,
    [status, linkId, accountId]
  );
  return res.rows[0] ?? null;
}

export async function getAssetLinkConflicts(
  client: PoolClient,
  accountId: string,
  homeboxItemId: string,
  excludeEntityId: string
): Promise<{ entity_type: string; entity_id: string }[]> {
  const res = await client.query<{ entity_type: string; entity_id: string }>(
    `SELECT entity_type, entity_id
     FROM asset_links
     WHERE account_id = $1
       AND homebox_item_id = $2
       AND entity_id != $3
       AND status != 'returned'`,
    [accountId, homeboxItemId, excludeEntityId]
  );
  return res.rows;
}
