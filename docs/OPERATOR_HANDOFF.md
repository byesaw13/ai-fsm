# Operator Handoff (Minimal Human Role)

## Human Responsibilities Only
1. Provide business priorities and acceptance sign-off.
2. Provide infrastructure credentials/secrets.
3. Approve production cutover window.

## Human Must Not Do
- Manual coding for feature implementation.
- Manual test triage unless AI cannot reproduce issue.
- Manual deployment steps that can be scripted.

## Start Command Set
```bash
cd /home/nick/dev/ai-fsm
cp .env.example .env
pnpm install
```

Then start AI agents using `docs/AI_BOOTSTRAP_PROMPT.md`.
