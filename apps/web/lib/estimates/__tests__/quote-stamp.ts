import { Client } from "pg";
import { quoteUpdatedAt } from "../quote-version";

/** The updated_at a quote page would send, read from the test database. */
export async function quoteStamp(id: string): Promise<string> {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT updated_at FROM estimates WHERE id = $1`, [id]);
    return quoteUpdatedAt(rows[0]?.updated_at);
  } finally {
    await client.end();
  }
}
