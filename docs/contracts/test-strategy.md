# Test Strategy Contract

## Gate Sequence
1. lint
2. typecheck
3. unit
4. integration
5. e2e
6. security/rls abuse
7. build
8. deploy smoke

## Severity Policy
- Blocker/Critical: release blocked
- High: release blocked unless risk acceptance record exists
- Medium/Low: backlog with SLA
