import { createLogger, type LogLevel, type LogRecord } from "./index";

const { logger, _setWriter } = createLogger({ service: "web" });

export { logger, _setWriter, type LogLevel, type LogRecord };