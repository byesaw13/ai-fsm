/**
 * Shared types for the Dovetails OS MCP server.
 *
 * Kept free of runtime imports (type-only) so tool modules and their unit tests
 * can depend on it without pulling in `pg`.
 */

/** Roles permitted to operate the MCP server. Techs are intentionally excluded. */
export type McpRole = "owner" | "admin";

/**
 * The resolved operator identity. Every tool query is scoped to this account,
 * both via an explicit `account_id = $1` predicate and via RLS session vars set
 * by {@link withMcpSession}.
 */
export interface Session {
  userId: string;
  accountId: string;
  role: McpRole;
  fullName: string;
}

/**
 * Minimal query surface a tool needs. Backed in production by a transaction-
 * scoped `pg` client (read-only); in tests by an in-memory fake. Tools never
 * see a connection, a pool, or the ability to run arbitrary statements outside
 * this interface — there is no raw-SQL passthrough exposed to MCP clients.
 */
export interface Executor {
  query<T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
