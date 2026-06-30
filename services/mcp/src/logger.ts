/**
 * MCP server logger — thin wrapper around @ai-fsm/log.
 *
 * IMPORTANT: writes to **stderr**, never stdout. The stdio MCP transport owns
 * stdout for JSON-RPC framing; any stray stdout write corrupts the protocol.
 */

import { createLogger } from "@ai-fsm/log";

const { logger, _setWriter } = createLogger({ service: "mcp", sink: "stderr" });

export { logger, _setWriter };