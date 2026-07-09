import { createLogger } from "./index";

const { logger, _setWriter } = createLogger({ service: "mcp", sink: "stderr" });

export { logger, _setWriter };