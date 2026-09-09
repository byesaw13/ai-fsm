# TASK-132: Audit hardening after framework patch

Status: In Progress
Phase: cross-cutting

Problem: The September 8 audit confirmed an affected Next.js runtime, integration suites excluded from CI, superuser application database access, oversized project loading, and unused development Redis.

Business Value: Protect customer data and make the existing workflow more reliable without adding product scope.

Scope / approved design:
- Follow the separately validated framework patch (TASK-131).
- Run database and HTTP integration tests in CI; fail if prerequisites are absent.
- Separate migration credentials from restricted runtime roles, fix transaction context lifetime, and exercise real RLS isolation before rollout.
- Simplify project data loading with existing helpers and measure representative loading.
- Delete unused development/test Redis service and configuration.

Acceptance Criteria:
- [ ] Framework build, lint, types, unit and release smoke pass.
- [ ] Integration suites execute in CI rather than silently being excluded.
- [ ] Restricted runtime role has no superuser or RLS-bypass privilege; authenticated and background flows pass.
- [ ] Project page behavior preserved with simpler loading.
- [ ] Redis is absent from active local/test setup.
- [ ] Deployment is verified; any external credential rotation limitations are recorded.

Out of Scope: New product features, broad UI redesign, new infrastructure dependencies.
