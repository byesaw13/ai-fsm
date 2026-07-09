import { createLogger, type LogLevel, type LogRecord } from "./index";

const { logger, _setWriter } = createLogger({ service: "worker" });

export { logger, _setWriter, type LogLevel, type LogRecord };