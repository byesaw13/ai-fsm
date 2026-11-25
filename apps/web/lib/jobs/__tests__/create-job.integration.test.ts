/**
 * Integration: one function creates jobs and fills in the customer's only
 * property (TASK-250).
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client, type PoolClient } from "pg";
import { createJob } from "../create-job";

const RUN = !!process.env.TEST_DATABASE_URL;
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("createJob (TASK-250)", () => {
  let client: Client;
  let db: PoolClient;
  const clientIds: string[] = [];

  const customer = async (properties: number) => {
    const id = (await client.query(
      `INSERT INTO clients (account_id, name) VALUES ($1,'Create Job Test') RETURNING id`, [SEED_ACCOUNT],
    )).rows[0].id as string;
    clientIds.push(id);
    const props: string[] = [];
    for (let i = 0; i < properties; i++) {
      props.push((await client.query(
        `INSERT INTO properties (account_id, client_id, address) VALUES ($1,$2,$3) RETURNING id`,
        [SEED_ACCOUNT, id, `${i + 1} Test St`],
      )).rows[0].id);
    }
    return { id, props };
  };
  const job = (clientId: string, extra = {}) =>
    createJob<{ id: string; property_id: string | null; status: string }>(db, {
      account_id: SEED_ACCOUNT, client_id: clientId, title: "Test job", created_by: SEED_OWNER, ...extra,
    });

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    db = client as unknown as PoolClient;
    await client.query(
      `SELECT set_config('app.current_account_id',$1,false), set_config('app.current_user_id',$2,false), set_config('app.current_role','owner',false)`,
      [SEED_ACCOUNT, SEED_OWNER],
    );
  });

  afterAll(async () => {
    for (const id of clientIds) {
      await client.query(`DELETE FROM jobs WHERE client_id = $1`, [id]);
      await client.query(`DELETE FROM properties WHERE client_id = $1`, [id]);
      await client.query(`DELETE FROM clients WHERE id = $1`, [id]);
    }
    await client.end();
  });

  it("fills in the customer's only property", async () => {
    const c = await customer(1);
    expect((await job(c.id)).property_id).toBe(c.props[0]);
  });

  it("leaves it open when the customer has several, or none", async () => {
    expect((await job((await customer(2)).id)).property_id).toBeNull();
    expect((await job((await customer(0)).id)).property_id).toBeNull();
  });

  it("keeps a property and status the caller chose", async () => {
    const c = await customer(2);
    const j = await job(c.id, { property_id: c.props[1], status: "quoted" });
    expect(j).toMatchObject({ property_id: c.props[1], status: "quoted" });
  });
});
