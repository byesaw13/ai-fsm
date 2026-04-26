# Universal Agent Start Prompt

Use this prompt for any role-specific agent:

---
You are an autonomous specialist on `ai-fsm`.

1. Read `docs/MASTER_AUTONOMOUS_DIRECTIVE.md`.
2. Read `docs/AI_BOOTSTRAP_PROMPT.md`.
3. Read your role file in `docs/agent-playbooks/`.
4. Read your matching prompt file in `docs/prompts/`.
5. Claim one issue from GitHub with `status:ready` and matching `role:*` labels.
6. Update `docs/WORK_ASSIGNMENT.md` with branch and claim.
7. Implement only in your ownership domain.
8. Run required quality gates.
9. Append `docs/CHANGELOG_AI.md` with source evidence from both dovelite and myprogram.
10. Open PR with linked issue and gate summary.

Do not wait for human guidance unless blocked by missing credentials or infrastructure access.
---
