# AI Memory Directory: Dovetails FSM

This directory is an optimized memory cache designed for LLM coding agents (Claude Code, ChatGPT, Antigravity) to reduce token consumption and keep context scopes narrow.

## 1. Documentation Hierarchy
To prevent duplication and product identity drift, the workspace adheres to a strict documentation hierarchy. If conflicts exist between files, higher levels always override lower levels:

1. **Active Code & Database Migrations** (Level 1: Ground Truth)
2. **Canonical Specifications** in [docs/canonical/](file:///home/nick/ai-fsm-deploy-clean/docs/canonical) (Level 2: Product Truth)
3. **Contracts & Guides** in [docs/contracts/](file:///home/nick/ai-fsm-deploy-clean/docs/contracts) and [docs/](file:///home/nick/ai-fsm-deploy-clean/docs/) (Level 3: Supporting Context)
4. **AI Memory Summaries** in [ai/](file:///home/nick/ai-fsm-deploy-clean/ai/) (Level 4: Tooling Context - *Never Authoritative*)

## 2. Directory Contents

- **[ai_working_rules.md](file:///home/nick/ai-fsm-deploy-clean/ai/ai_working_rules.md)**: Standard operating rules, reading order, and pre-flight checklists for AI agents.
- **[domain_model.md](file:///home/nick/ai-fsm-deploy-clean/ai/domain_model.md)**: Distilled entity relationship summary pointing back to the canonical Domain Model.
- **[roadmap.md](file:///home/nick/ai-fsm-deploy-clean/ai/roadmap.md)**: High-level overview of active roadmap status pointing back to the canonical Roadmap.
- **[decisions.md](file:///home/nick/ai-fsm-deploy-clean/ai/decisions.md)**: Summary of locked architectural decisions pointing back to the canonical Decision Log.
- **[business_rules.md](file:///home/nick/ai-fsm-deploy-clean/ai/business_rules.md)**: Core status contracts and entity rules.
- **[database_rules.md](file:///home/nick/ai-fsm-deploy-clean/ai/database_rules.md)**: Strict structural database schemas and RLS template mandates.
- **[pricing_engine.md](file:///home/nick/ai-fsm-deploy-clean/ai/pricing_engine.md)**: Pricing methodology guidelines referencing code rates.
- **[current_focus.md](file:///home/nick/ai-fsm-deploy-clean/ai/current_focus.md)**: Strategic objectives currently active for the system.
- **[common_mistakes.md](file:///home/nick/ai-fsm-deploy-clean/ai/common_mistakes.md)**: Common coding/configuration errors to avoid.
- **[glossary.md](file:///home/nick/ai-fsm-deploy-clean/ai/glossary.md)**: Authoritative business vocabulary to prevent terminology drift.
