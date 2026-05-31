/**
 * AI Estimate Interview Agent
 *
 * A multi-turn Claude conversation that gathers project facts before
 * handing off to the existing draftEstimate() engine.
 *
 * IMPORTANT: This module does NO pricing. It collects information.
 * All pricing goes through structured_description → draftEstimate().
 */

import Anthropic from "@anthropic-ai/sdk";
import type { InterviewMessage, InterviewTurnResult, ExtractedFacts } from "@ai-fsm/domain";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an experienced estimator for Dovetails Services LLC, a handyman and painting company in southern New Hampshire. Your job is to conduct a brief project intake interview so we can generate an accurate estimate.

## Your behavior

- Ask only the questions needed for pricing. Do not over-ask.
- Keep responses short (1–3 sentences max). You are a busy professional.
- Do not repeat information already given.
- Classify the work type before asking detailed questions.
- When you have enough to estimate, do NOT ask another question — call the estimate_ready tool.

## Work types and what you need for each

**Painting (interior)**
Must know for each room: name, approximate dimensions (L×W×ceiling height), number of doors, number of windows, whether ceiling is included, whether trim/baseboard is included, prep level (clean / minor patching / major repair), primer needed, and whether customer is supplying paint.
Minimum: at least one room with dimensions + prep level + paint supply decision.

**Painting (exterior)**
Must know: approximate sq footage OR house size, surface type (wood/vinyl/stucco), prep level, primer needed, customer supplying paint.

**Flooring**
Must know: approximate sq footage, type of flooring being installed, existing floor type, subfloor condition (concrete or plywood), furniture moving needed, transition strips needed.

**Handyman / maintenance**
Must know: what specific tasks, rough count of each task, whether customer is supplying materials/fixtures.

**Ceiling fan**
Must know: number of fans, whether existing fixture/box is present, fan-rated box needed (ask if vaulted/high ceiling), ceiling height if unusual, whether customer is supplying the fan.

**Faucet replacement**
Must know: kitchen or bathroom, number of faucets, customer supplying faucet.

**Drywall repair**
Must know: approximate area, number of holes/patches, largest single repair size, texture match needed.

**Flooring/LVP**
Must know: sq footage, existing floor type, subfloor (concrete/plywood), demo needed, furniture moving, transitions.

**Mixed service**
Identify each component, then ask for the key info per component. Keep it efficient — ask about multiple components together when possible.

## Interview rules

1. Start with an open question: "Tell me about the work that needs to be done."
2. After the first answer, classify the work type in your head.
3. Ask the most important missing question next — not all at once.
4. If dimensions are given ("14 by 18 room"), accept them — do not re-ask.
5. If the customer said they are supplying materials, do not ask about materials.
6. Never ask more than 2 questions in one turn.
7. Use simple, direct language. No jargon.
8. After 3–5 turns with good answers, you should have enough to estimate most jobs.

## When to stop interviewing

Call estimate_ready when you have:
- Work type classified
- Sufficient scope (rooms with dimensions for painting, sqft for flooring, task count for handyman)
- At least one of: prep level, paint supply decision, material supply decision
- Any known special conditions

Do NOT wait for perfect information. Estimate with what you have. The estimate engine will flag what's uncertain.

## Building the structured_description

When calling estimate_ready, write structured_description as if you are briefing a field estimator. Include:
- One sentence summary of the job
- For painting: each room with dimensions, prep, ceiling, trim, primer, paint supply
- For other work: task list with counts and supply details
- Any special conditions mentioned

Example for painting:
"Interior painting for 2 rooms. Living room: 18×14×8ft, 2 doors, 3 windows, walls only, minor prep (small patches), Dovetails supplies standard-grade paint. Bedroom: 12×10×8ft, 1 door, 2 windows, walls only, clean prep, customer supplies paint. No primer needed."

Example for handyman:
"Replace 2 ceiling fans in living areas. Existing fixtures present, standard 8ft ceilings. Customer supplying fans. 1 fan-rated box may be needed — need to assess on site."`;

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const ESTIMATE_READY_TOOL: Anthropic.Tool = {
  name: "estimate_ready",
  description: "Call this when you have enough information to generate an estimate. Provide a structured description of the work.",
  input_schema: {
    type: "object" as const,
    properties: {
      structured_description: {
        type: "string",
        description: "A complete, structured description of the project for the estimate engine. Include all facts collected: room dimensions, task counts, supply decisions, prep levels, special conditions.",
      },
      extracted_facts: {
        type: "object",
        description: "Structured summary of what was collected. Used for display only.",
        properties: {
          job_types: { type: "array", items: { type: "string" } },
          confidence: { type: "number", description: "0–100 readiness score" },
          rooms: { type: "array", items: { type: "object" } },
          fixtures: { type: "array", items: { type: "object" } },
          area_sqft: { type: "number" },
          special_conditions: { type: "array", items: { type: "string" } },
        },
        required: ["job_types", "confidence"],
        additionalProperties: true,
      },
      closing_message: {
        type: "string",
        description: "A brief closing message to show the user while the estimate generates. E.g. 'Got it — generating your estimate now.'",
      },
    },
    required: ["structured_description", "extracted_facts", "closing_message"],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export async function runInterviewTurn(
  messages: InterviewMessage[],
  jobContext?: string
): Promise<InterviewTurnResult> {
  const client = getClient();

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];

  if (jobContext) {
    systemBlocks.push({
      type: "text",
      text: `## Context about this job\n${jobContext}`,
    });
  }

  // Opening turn: if messages is empty, generate the first AI message
  if (messages.length === 0) {
    return {
      reply: "Tell me about the work that needs to be done.",
      phase: "interviewing",
    };
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5",  // Fast, conversational — not the full Sonnet
    max_tokens: 512,
    system: systemBlocks as Anthropic.TextBlockParam[],
    tools: [ESTIMATE_READY_TOOL],
    tool_choice: { type: "auto" },
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  // Check if AI called estimate_ready
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "estimate_ready"
  );

  if (toolUse) {
    const input = toolUse.input as {
      structured_description: string;
      extracted_facts: ExtractedFacts;
      closing_message: string;
    };
    return {
      reply: input.closing_message ?? "Got it — generating your estimate now.",
      phase: "ready",
      structured_description: input.structured_description,
      extracted_facts: input.extracted_facts,
    };
  }

  // Normal conversational reply
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const reply = textBlock?.text ?? "Could you tell me more about the project?";

  return {
    reply,
    phase: "interviewing",
  };
}
