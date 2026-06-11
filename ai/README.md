# AI Quick Reference Layer

The `/ai` folder exists to reduce AI context usage. It gives coding agents a compact cache of repo guidance, common constraints, and links into the documentation that actually defines the product.

`/ai` summarizes and links to canonical docs. It is not authoritative.

Documentation hierarchy:

1. Code and database migrations are the implemented truth.
2. `docs/canonical/` is the authoritative product, domain, and architecture truth.
3. `docs/contracts/` and `docs/working/` contain supporting implementation notes.
4. `ai/` is only a compact AI-agent quick-reference layer.
5. `docs/archive/` and `docs/generated/` are historical/evidence only, not active instruction sources.

If `/ai` conflicts with `docs/canonical/`, `docs/canonical/` wins.

If any documentation conflicts with code or database migrations, the code and migrations win until the docs are corrected.

Start with:

- `ai/ai_working_rules.md`
- `docs/canonical/DOMAIN_MODEL.md`
- `docs/canonical/ARCHITECTURE.md`
- `docs/canonical/WORKFLOW.md`
- `docs/canonical/PRODUCT_VISION.md`
