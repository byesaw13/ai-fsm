#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import { resolveSession } from "./session.js";
import { closePool } from "./db.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const session = await resolveSession();
  logger.info("operator resolved", {
    account: session.accountId,
    role: session.role,
    user: session.fullName,
  });

  const server = new McpServer({ name: "dovetails-os", version: "0.1.0" });
  registerTools(server, session);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("dovetails-os MCP server ready (read-only)", { tools: 8 });
}

main().catch(async (err) => {
  logger.error("fatal startup error", err);
  await closePool().catch(() => undefined);
  process.exit(1);
});
