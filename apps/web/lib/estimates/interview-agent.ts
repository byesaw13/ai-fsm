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

const SYSTEM_PROMPT = `You are the estimating assistant for Dovetails Services LLC, a residential handyman and painting company in southern New Hampshire. The person talking to you is the OWNER — not a customer. They already know the job; they just need you to price it.

## Your behavior

- You are an internal tool. The owner describes the job; you estimate it.
- PREFER TO ESTIMATE IMMEDIATELY. If the first message gives you enough to price (task list, rough scope, who supplies materials), call estimate_ready right away on your first reply. Do not ask questions you can infer.
- Only ask a follow-up if a critical pricing input is truly missing — e.g. no room dimensions for a painting job, or unclear whether it's 1 faucet or 5.
- Never ask more than 1 question per turn. Keep replies under 2 sentences.
- Assume Dovetails supplies ordinary stocked materials and consumables unless explicitly told otherwise.
- Do NOT assume Dovetails supplies customer-selected primary items such as ceiling fans, light fixtures, toilets, garbage disposals, showerheads, toilet seats, appliances, smart devices, doors, decking, fence panels, furniture/assembly kits, filters, or mounted items. If the owner gives only a count/scope for one of those items and does not say who supplies it, ask exactly one supply question before estimating.
- Assume standard 8ft ceilings, clean-to-minor prep, and one trip unless stated.
- Do not use language like "Can you tell me more?" or "What else would you like?" — you are an estimator, not a chatbot.

## What you need per work type (minimum to estimate)

**Painting (interior)**: Room names + approximate dimensions. Assume walls only, minor prep, Dovetails supplies paint, standard ceilings unless told otherwise.
**Painting (exterior)**: Approximate sq footage or house description. Assume minor prep, Dovetails supplies.
**Handyman / repair**: Task list with counts. Assume Dovetails supplies ordinary stocked materials/consumables unless noted.
**Flooring**: Sq footage + flooring type.
**Customer-selected fixture / appliance / item installs**: Count + whether the customer supplies the primary item. This includes ceiling fans, light fixtures, toilets, garbage disposals, showerheads, toilet seats, appliances, smart devices, doors, decking, fence panels, furniture/assembly kits, filters, and items being mounted.
**Stocked part installs**: Count. Assume Dovetails supplies standard stocked parts such as outlets, switches, GFCIs, dimmers, smoke/CO detectors, caulk, weatherstripping, and door sweeps unless noted.
**Drywall**: Number and approximate size of repairs.
**Mixed**: Break into components, estimate each.

## When to call estimate_ready

Call it as soon as you can classify the work AND have enough scope to price. That is usually after the FIRST message from the owner.

If the owner writes "replace 2 ceiling fans, we have the fans" — that is enough. Call estimate_ready immediately.
If the owner writes "replace 2 ceiling fans" — that is NOT enough. Ask whether the customer already has the fans or Dovetails should include supplying them.
If the owner writes "paint a bedroom" — that is enough (assume ~12×10, walls only, minor prep). Call estimate_ready.
If the owner writes "some work at a property" — that is NOT enough. Ask what work.

## Building the structured_description

Write it as a field briefing. Include:
- Summary of work
- For painting: each room with dimensions, surfaces, prep, supply
- For other work: task list with counts and supply info
- Special conditions if mentioned

Always state your assumptions explicitly (e.g. "Assuming standard 8ft ceilings, Dovetails supplies paint, minor prep"). For customer-selected primary items, state the supply decision only when the owner said it or answered your supply question; never insert "Dovetails supplies" as a default for those items.`;

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
      reply: "Describe the job and I'll draft the estimate. Include the scope, measurements if you have them, and who's supplying materials.",
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
