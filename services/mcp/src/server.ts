import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withMcpSession } from "./db.js";
import type { Session } from "./types.js";
import { tools } from "./tools/index.js";
import { logger } from "./logger.js";

/**
 * Register every read-only tool on the server, bound to a single resolved
 * operator session. Each call runs inside a read-only, account-scoped
 * transaction and returns structured JSON. Errors are surfaced to the MCP
 * client as an `isError` result rather than crashing the server.
 */
export function registerTools(server: McpServer, session: Session): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputShape,
      },
      async (args) => {
        try {
          const result = await withMcpSession(session, (exec) => tool.run(exec, session, args));
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          logger.error("tool failed", err, { tool: tool.name });
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
            isError: true,
          };
        }
      },
    );
  }
}
