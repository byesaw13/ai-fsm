# TASK-259: Move AI features to the current Claude models

Status:
In Review

Epic:
EPIC-005 Platform & Delivery

Phase:
cross-cutting

Severity:
Low. The AI features work, but they run on older models (Sonnet 4.6, Haiku 4.5, Opus 4.7) that cost more and do worse than the current ones.

Decision (owner, 2026-11-26): upgrade the models already in use instead of adding a second AI provider (Grok). No new AI features.

Problem:
Every AI call names an older model. Sonnet 4.6 and Opus 4.7 calls are priced above their 5.5 replacements (Sonnet 5.5 $2/$10 vs $3/$15 per MTok; Opus 5.5 $4/$20 vs $5/$25). Haiku 5.5 is $0.10/$0.50 vs $1/$5.

Scope:
- Swap the model ID at every call site: Sonnet 4.6 → `claude-sonnet-5-5`, Haiku 4.5 → `claude-haiku-5-5`, Opus 4.7 → `claude-opus-5-5`.
- Sonnet 5.5 and Opus 5.5 reject forced `tool_choice`. Those calls (scope, review, T&M briefing, materials, task breakdown, AI draft, day narrative) switch to `auto` and the user message names the tool. Every site already falls back or errors legibly when no tool call comes back.
- Thinking is always on in the 5.5 models and counts toward `max_tokens`. Raise `max_tokens` where it was tight, and set `output_config.effort` explicitly (`medium` for estimating, `low` for chat, summaries and the day narrative).
- Remove `temperature: 0` from the two receipt routes (Sonnet 5.5 rejects it).
- Booking-request summary reads the text block by type, not `content[0]`, because a reply can start with a thinking block.
- Haiku 5.5 still accepts forced `tool_choice` (SMS sorting, item suggestions), so those only change the ID.

Out of scope:
- A second AI provider, provider abstraction, or OpenRouter.
- Server-side refusal fallbacks (beta). Refusals already end in each site's existing fallback.
- Effort tuning against an eval. Revisit if quality or speed changes noticeably.

Acceptance Criteria:
- [x] No call site names a 4.x model.
- [x] `pnpm gate:fast` passes.
- [x] Pre-merge live smoke test: one real call per feature on the 5.5 models, 12/12 returned a valid result (2026-11-26).
- [ ] On production, each AI feature returns a result once: AI draft, materials list, task breakdown, review, scope notes, T&M briefing, receipt scan, SMS sorting, booking summary, estimate interview, day narrative.

Test Plan:
- Unit: existing AI unit tests (review test updated for `auto` tool choice and the new ID).
- Manual: one live call per feature after deploy.

Build:
Maintenance. Not on a runbook track.
