import { z } from "zod";
import type { Executor, Session } from "../types.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  query: z.string().trim().min(1, "query is required").describe("Name, email, or phone fragment to search for"),
  limit: z.number().int().min(1).max(50).default(20).describe("Max results (1-50, default 20)"),
};
const schema = z.object(inputShape);

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export async function run(exec: Executor, ctx: Session, input: unknown): Promise<unknown> {
  const { query, limit } = schema.parse(input);
  const like = `%${query}%`;
  const { rows } = await exec.query<ClientRow>(
    `SELECT id, name, email, phone
       FROM clients
      WHERE account_id = $1
        AND (name ILIKE $2 OR COALESCE(email, '') ILIKE $2 OR COALESCE(phone, '') ILIKE $2)
      ORDER BY name
      LIMIT $3`,
    [ctx.accountId, like, limit],
  );

  return {
    query,
    count: rows.length,
    clients: rows.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
  };
}

export const tool: ToolModule = {
  name: "search_clients",
  title: "Search clients",
  description:
    "Find clients by name, email, or phone fragment (case-insensitive). Returns id, name, and contact details. Use the returned id with get_client_summary.",
  inputShape,
  run,
};

export default tool;
