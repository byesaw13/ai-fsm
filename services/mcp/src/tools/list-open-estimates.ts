import { z } from "zod";
import type { Executor, Session } from "../types.js";
import { money } from "../money.js";
import type { ToolModule } from "./types.js";

const inputShape = {
  client_id: z.string().uuid().optional().describe("Limit to a single client"),
  limit: z.number().int().min(1).max(100).default(50).describe("Max results (1-100, default 50)"),
};
const schema = z.object(inputShape);

type Row = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  sent_at: string | null;
  expires_at: string | null;
  client_name: string;
};

export async function run(exec: Executor, ctx: Session, input: unknown): Promise<unknown> {
  const { client_id, limit } = schema.parse(input);
  const { rows } = await exec.query<Row>(
    `SELECT e.id, e.status, e.total_cents, e.created_at, e.sent_at, e.expires_at,
            c.name AS client_name
       FROM estimates e
       JOIN clients c ON c.id = e.client_id
      WHERE e.account_id = $1
        AND e.status IN ('draft', 'sent')
        AND ($2::uuid IS NULL OR e.client_id = $2)
      ORDER BY e.created_at DESC
      LIMIT $3`,
    [ctx.accountId, client_id ?? null, limit],
  );

  let totalValue = 0;
  const estimates = rows.map((r) => {
    totalValue += r.total_cents;
    return {
      id: r.id,
      status: r.status,
      client_name: r.client_name,
      total: money(r.total_cents),
      created_at: r.created_at,
      sent_at: r.sent_at,
      expires_at: r.expires_at,
    };
  });

  return { count: estimates.length, total_value: money(totalValue), estimates };
}

export const tool: ToolModule = {
  name: "list_open_estimates",
  title: "Open estimates",
  description:
    "List estimates not yet decided (status draft or sent), newest first. Optionally filter by client. Includes the combined pipeline value.",
  inputShape,
  run,
};

export default tool;
