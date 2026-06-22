import type { ZodRawShape } from "zod";
import type { Executor, Session } from "../types.js";

/**
 * A read-only MCP tool.
 *
 * `inputShape` is a Zod raw shape (an object of Zod validators). The MCP SDK
 * turns it into the tool's JSON-Schema and validates inbound args; each `run`
 * also re-parses defensively so the function is safe to call directly in tests.
 */
export interface ToolModule {
  name: string;
  title: string;
  description: string;
  inputShape: ZodRawShape;
  run(exec: Executor, ctx: Session, input: unknown): Promise<unknown>;
}
