# AI Working Rules: Dovetails FSM

> [!IMPORTANT]
> **Product direction is defined only by the canonical documentation set under `docs/canonical/` (as specified in [AGENTS.md](file:///home/nick/ai-fsm-deploy-clean/AGENTS.md))**. The `/ai` memory files serve as developer guidelines, constraints, and operational checklists for AI tools, and must never override canonical product definitions.

This is the entry point for all AI coding agents (Claude, ChatGPT, Antigravity) working in this repository. Read this file before checking other code.

## 1. Documentation Hierarchy

Use documentation in this order:

1. Code and database migrations are the implemented truth.
2. `docs/canonical/` is the authoritative product, domain, and architecture truth.
3. `docs/contracts/` and `docs/working/` contain supporting implementation notes.
4. `ai/` is only a compact AI-agent quick-reference layer.
5. `docs/archive/` and `docs/generated/` are historical/evidence only, not active instruction sources.

If `/ai` conflicts with `docs/canonical/`, `docs/canonical/` wins. If any documentation conflicts with code or migrations, code and migrations win until the docs are corrected.

## 2. Initial Reading Order & Pre-flight Checklist

Before proposing or writing any code, read these files in this order:

1. [ai/README.md](file:///home/nick/ai-fsm-deploy-clean/ai/README.md)
2. [ai/ai_working_rules.md](file:///home/nick/ai-fsm-deploy-clean/ai/ai_working_rules.md) (this file)
3. Canonical product specifications:
   - [DOMAIN_MODEL.md](file:///home/nick/ai-fsm-deploy-clean/docs/canonical/DOMAIN_MODEL.md)
   - [ARCHITECTURE.md](file:///home/nick/ai-fsm-deploy-clean/docs/canonical/ARCHITECTURE.md)
   - [WORKFLOW.md](file:///home/nick/ai-fsm-deploy-clean/docs/canonical/WORKFLOW.md)
   - [PRODUCT_VISION.md](file:///home/nick/ai-fsm-deploy-clean/docs/canonical/PRODUCT_VISION.md)
4. AI summaries when relevant:
   - [current_focus.md](file:///home/nick/ai-fsm-deploy-clean/ai/current_focus.md), if present
   - [common_mistakes.md](file:///home/nick/ai-fsm-deploy-clean/ai/common_mistakes.md), if present
   - Other `/ai` files only as quick references; never as canonical product or domain sources.

### Before Writing Code Checklist

1. Read the relevant canonical docs and AI quick references listed above.
2. Search the existing codebase for similar features or imports.
3. Reuse existing patterns: routing setup, SQL helpers, CSS styling, components.
4. Only then propose changes to code or schema.

## 3. Hard Architectural Constraints

- **Never Introduce an ORM**: Do not install Prisma, Drizzle, TypeORM, or other ORMs. All DB operations use raw SQL queries via the `pg` client/pool.
- **Never Change Tenant Scope**: Do not introduce SaaS multi-user-account relationships or change the tenant/account structure. The app runs as a single-business tenant target.
- **Never Create Ambiguous Entities**: Do not add new database tables or domain entities without first verifying they fit `docs/canonical/DOMAIN_MODEL.md`.
- **Never Override Decisions**: Respect formal ADRs in `docs/DECISION_LOG.md`. `ai/decisions.md` is only a reminder summary.

## 4. Development Preferences

- **Incremental Changes**: Prefer small, surgical, and incremental code changes over massive class or module refactorings.
- **Align with Existing Patterns**: Check how similar features are implemented. For SQL query formats, routing handlers, error structures, or CSS patterns, copy the conventions already established in the codebase.
- **Run the Quality Gate**: Run `pnpm gate:fast` to ensure type safety, linting checks, and unit tests compile and pass successfully before finalizing a task.
- **Update Canonical Docs First**: If a task changes product direction, update `docs/canonical/` first or in the same change. Only update `/ai` as a derived summary.
