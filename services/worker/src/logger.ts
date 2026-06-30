/**
 * Worker service logger — thin wrapper around @ai-fsm/log.
 *
 * Usage:
 *   import { logger } from "./logger.js";
 *   logger.info("poll tick", { due: 3 });
 *   logger.error("db error", err, { automationId });
 *
 * Test helper:
 *   import { _setWriter } from "./logger.js";  // test-only
 */

import { createLogger, type LogLevel, type LogRecord } from "@ai-fsm/log";

const { logger, _setWriter } = createLogger({ service: "worker" });

export { logger, _setWriter, type LogLevel, type LogRecord };