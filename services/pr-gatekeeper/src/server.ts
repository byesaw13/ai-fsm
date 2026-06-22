import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tools } from "./tools/index.js";
import { redact } from "./redact.js";
import { logger } from "./logger.js";

/**
 * Register every gatekeeper tool. Each returns structured JSON; errors are
 * surfaced as an `isError` result (redacted) instead of crashing the server.
 */
export function registerTools(server: McpServer): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputShape },
      async (args) => {
        try {
          const result = await tool.run(args);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          logger.error("tool failed", err, { tool: tool.name });
          const message = redact(err instanceof Error ? err.message : String(err));
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
            isError: true,
          };
        }
      },
    );
  }
}
