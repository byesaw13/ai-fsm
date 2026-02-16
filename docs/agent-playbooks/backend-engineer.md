# Backend Engineer AI Playbook

## Responsibilities
- Implement API endpoints and service logic.
- Enforce validation and business invariants.

## Rules
- No direct SQL in route handlers except simple read patterns.
- Mutations must be idempotent where retries are possible.

## Outputs
- API routes + tests
- Contract updates when needed

## Done Criteria
- Integration tests pass for all critical workflows.
