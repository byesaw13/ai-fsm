import { getPool } from "./db.js";
import type { McpRole, Session } from "./types.js";

/** Roles allowed to operate the server. */
const ALLOWED_ROLES: readonly string[] = ["owner", "admin"];

type UserRow = {
  id: string;
  account_id: string;
  role: string;
  full_name: string;
};

/**
 * Resolve the operator identity from the environment.
 *
 * Configure exactly one of:
 *   DOVETAILS_MCP_USER_EMAIL  — preferred (human readable)
 *   DOVETAILS_MCP_USER_ID     — explicit user UUID
 *
 * The whole server runs as this single identity, so enforcing owner/admin here
 * makes the entire tool surface owner/admin only. A `tech` user is rejected
 * outright. (Mirrors the unscoped user lookup in apps/web/lib/auth/session.ts.)
 */
export async function resolveSession(): Promise<Session> {
  const email = process.env.DOVETAILS_MCP_USER_EMAIL?.trim();
  const userId = process.env.DOVETAILS_MCP_USER_ID?.trim();

  if (!email && !userId) {
    throw new Error(
      "Set DOVETAILS_MCP_USER_EMAIL (or DOVETAILS_MCP_USER_ID) to the owner/admin operating this MCP server",
    );
  }

  const pool = getPool();
  const { rows } = userId
    ? await pool.query<UserRow>(
        `SELECT id, account_id, role, full_name FROM users WHERE id = $1`,
        [userId],
      )
    : await pool.query<UserRow>(
        `SELECT id, account_id, role, full_name FROM users WHERE lower(email) = lower($1)`,
        [email],
      );

  const user = rows[0];
  if (!user) {
    throw new Error(`No user found for ${email ? `email ${email}` : `id ${userId}`}`);
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    throw new Error(
      `User ${user.full_name} has role '${user.role}'. The Dovetails MCP server is owner/admin only.`,
    );
  }

  return {
    userId: user.id,
    accountId: user.account_id,
    role: user.role as McpRole,
    fullName: user.full_name,
  };
}
