import type { PoolClient } from "pg";

/**
 * The one place jobs are created (TASK-250). A job with no property given gets
 * the customer's property when the customer has exactly one, so its work lands
 * in that property's history. Each caller still sets its own starting status.
 */
export type NewJob = {
  account_id: string;
  client_id: string;
  title: string;
  created_by: string | null;
  property_id?: string | null;
  description?: string | null;
  status?: string;
  job_type?: string;
  job_category?: string | null;
  priority?: number;
  booking_request_id?: string | null;
  pricing_mode?: string;
};

type Queryable = Pick<PoolClient, "query">;

export async function createJob<T extends { id: string } = { id: string }>(
  db: Queryable,
  job: NewJob,
): Promise<T> {
  const { property_id, ...rest } = job;
  const cols = (Object.keys(rest) as (keyof typeof rest)[]).filter((k) => rest[k] !== undefined);
  const values: unknown[] = cols.map((k) => rest[k]);
  const param = (v: unknown) => "$" + values.push(v);
  // One statement: the given property, else the customer's only one, else none.
  const propertySql = `COALESCE(${param(property_id ?? null)}::uuid, (
    SELECT min(id::text)::uuid FROM properties
    WHERE client_id = ${param(job.client_id)} AND account_id = ${param(job.account_id)}
    HAVING count(*) = 1))`;
  const res = await db.query<T>(
    `INSERT INTO jobs (${[...cols, "property_id"].join(", ")})
     VALUES (${[...cols.map((_, i) => "$" + (i + 1)), propertySql].join(", ")})
     RETURNING *`,
    values,
  );
  return res.rows[0];
}
