# TASK-204: Harden the estimating AI calls

Status:
Proposed

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Severity:
Medium.

Problem:
Nine estimating features call Claude (`apps/web/lib/estimates/`: scope,
review, prepare-quote, ai-draft, tm-briefing, materials-generator,
task-decomposer, interview-agent, item-suggester). Verified 2026-10-26:
- Six cast tool output to a type with no schema check (scope, review,
  ai-draft, tm-briefing, interview, item-suggester).
- Only materials, task-decomposer and prepare-quote check for a cut-off
  (max_tokens) response.
- interview-agent has no ANTHROPIC_API_KEY guard.
- Seven AI routes need only a login (`withAuth`), not owner/admin.
- Only prepare-quote sets a timeout; others use the SDK default (10 min,
  2 retries).
- No call records token usage.

Scope:
- Zod-validate every tool output; reject cut-off responses.
- Key guard on interview-agent with a clear 503.
- Owner/admin on ai-draft, ai-scope, ai-materials, ai-tm-briefing, review.
- 120 s timeout, 1 retry, on every client.
- Log model, input/output/cache tokens and duration per call.

Out of Scope:
Moving to newer models (forced tool use would need structured outputs first).

Acceptance Criteria:
- [ ] A malformed tool response returns a handled error or fallback, never a
      partial object.
- [ ] A tech user gets 403 from the five owner/admin AI routes.
- [ ] Each AI call writes one usage log line with token counts.

Related:
TASK-195, TASK-197.
