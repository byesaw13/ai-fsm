#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import { getRepoRoot } from "./config.js";
import { runAllowed } from "./exec.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  // Fail fast if git or gh are unavailable or the cwd is not a repo.
  const repoRoot = await getRepoRoot();
  const gh = await runAllowed("gh", ["pr", "view", "--help"]).catch(() => null);
  logger.info("pr-gatekeeper starting", {
    repo: repoRoot,
    gh_available: gh?.ok ?? false,
  });

  const server = new McpServer({ name: "dovetails-pr-gatekeeper", version: "0.1.0" });
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("dovetails-pr-gatekeeper ready (read-only)", { tools: 7 });
}

main().catch((err) => {
  logger.error("fatal startup error", err);
  process.exit(1);
});
