import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatHours, type DayDraft } from "@ai-fsm/domain";

const narrativeSchema = z.object({
  summary: z.string(),
});

/**
 * Optional AI write-up of an already-assembled day draft.
 * Never changes items, times, or ready/exception flags.
 */
export async function narrateDayDraft(draft: DayDraft, date: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const lines = draft.items
    .filter((i) => i.kind !== "gap")
    .map((i) => {
      const flag = i.alreadyLogged ? "logged" : i.ready ? "ready" : `exception:${i.exception ?? "review"}`;
      return `- ${i.label} (${i.minutes}m, ${i.proposedActivity ?? i.kind}, ${flag})`;
    })
    .join("\n");
  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5-5",
      // Room for thinking, which counts toward max_tokens.
      max_tokens: 2048,
      output_config: { effort: "low" },
      system: [{
        type: "text",
        text: "You write a 2-3 sentence end-of-day verification for a residential handyman. Use only the provided timeline. Do not invent stops, jobs, or times. Mention exceptions that still need a human. No markdown.",
        cache_control: { type: "ephemeral" },
      }],
      tools: [{
        name: "day_draft_narrative",
        description: "Short prose summary of the assembled day.",
        input_schema: {
          type: "object",
          properties: { summary: { type: "string" } },
          required: ["summary"],
        },
      }],
      // Sonnet 5.5 rejects forced tool_choice; the prompt names the tool.
      tool_choice: { type: "auto" },
      messages: [{
        role: "user",
        content: `Date: ${date}
Clocked: ${draft.clockedMinutes != null ? formatHours(draft.clockedMinutes) : "unknown"}
Attributed (ready + already logged): ${formatHours(draft.attributedMinutes)}
${draft.reconciliation}

Timeline:
${lines || "(no GPS signal today)"}

Use the day_draft_narrative tool to give your answer.`,
      }],
    });
    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;
    const parsed = narrativeSchema.safeParse(toolUse.input);
    return parsed.success ? parsed.data.summary.trim() : null;
  } catch {
    return null;
  }
}
