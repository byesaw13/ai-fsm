# AI Working Rules: Dovetails FSM

This is the entry point for all AI coding agents (Claude, ChatGPT, Antigravity) working in this repository. Read this file before checking other code.

## 1. Initial Reading Order & Pre-flight Checklist
Before proposing or writing any code, you must read the following files in this order:
1. **[ai_working_rules.md](file:///home/nick/ai-fsm-deploy-clean/ai/ai_working_rules.md)** (this file)
2. **[project_context.md](file:///home/nick/ai-fsm-deploy-clean/ai/project_context.md)**
3. **[domain_model.md](file:///home/nick/ai-fsm-deploy-clean/ai/domain_model.md)**
4. **[glossary.md](file:///home/nick/ai-fsm-deploy-clean/ai/glossary.md)**
5. **[business_rules.md](file:///home/nick/ai-fsm-deploy-clean/ai/business_rules.md)**
6. **[decisions.md](file:///home/nick/ai-fsm-deploy-clean/ai/decisions.md)**
7. **[current_sprint.md](file:///home/nick/ai-fsm-deploy-clean/ai/current_sprint.md)**

### Before Writing Code Checklist:
1. **Read all AI memory files** listed above.
2. **Search the existing codebase** for similar features or imports.
3. **Reuse existing patterns** (routing setup, SQL helpers, CSS styling, components).
4. **Only then propose changes** to code or schema.

## 2. Hard Architectural Constraints
- **Never Introduce an ORM**: Do not install Prisma, Drizzle, TypeORM, or other ORMs. All DB operations use raw SQL queries via the `pg` client/pool.
- **Never Change Tenant Scope**: Do not introduce SaaS multi-user-account relationships or change the tenant/account structure. The app runs as a single-business tenant target.
- **Never Create Ambiguous Entities**: Do not add new database tables or domain entities without first verifying they fit the definitions in `ai/domain_model.md`.
- **Never Override Decisions**: Respect all entries in `ai/decisions.md`. Do not refactor locked libraries (e.g., `jose`, `bcryptjs`) or UI patterns (e.g., `window.confirm`).

## 3. Development Preferences
- **Incremental Changes**: Prefer small, surgical, and incremental code changes over massive class or module refactorings.
- **Align with Existing Patterns**: Check how similar features are implemented. For SQL query formats, routing handlers, error structures, or CSS patterns, copy the conventions already established in the codebase.
- **Run the Quality Gate**: Run `pnpm gate:fast` to ensure type safety, linting checks, and unit tests compile and pass successfully before finalizing a task.
- **Update the Memory**: If your task results in an architectural change or a new locked decision, update `ai/decisions.md` or `ai/current_sprint.md` accordingly.
