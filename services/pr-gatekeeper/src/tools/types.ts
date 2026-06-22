import type { ZodRawShape } from "zod";

/** A PR Gatekeeper tool. `run` validates `input` against `inputShape` itself. */
export interface ToolModule {
  name: string;
  title: string;
  description: string;
  inputShape: ZodRawShape;
  run(input: unknown): Promise<unknown>;
}
