/**
 * Web application logger — thin wrapper around @ai-fsm/log.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("job created", { traceId, jobId });
 *   logger.error("db error", err, { traceId });
 *
 * Test helper:
 *   import { _setWriter } from "@/lib/logger";  // test-only
 */

import { createLogger, type LogLevel, type LogRecord } from "@ai-fsm/log";

const { logger, _setWriter } = createLogger({ service: "web" });

export { logger, _setWriter, type LogLevel, type LogRecord };