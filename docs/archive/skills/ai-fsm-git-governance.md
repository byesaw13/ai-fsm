# Skill: ai-fsm-git-governance

Use this skill for:

- branch creation
- PR merge decisions
- cleaning up bad local Git state
- verifying a deployment host is a real checkout of the canonical repo

## Workflow

1. Confirm canonical repo:
   - `git remote -v`
   - expected repo: `byesaw13/ai-fsm`
2. Confirm branch base:
   - `git fetch origin`
   - compare with `origin/main`
3. If merging:
   - read PR checks
   - use repo-allowed merge method only
4. If fixing a deployment checkout:
   - back up working tree
   - remove unrelated `.git`
   - replace with real checkout

## Never do

- `git init` in a deployment copy unless the explicit goal is to create a brand-new independent repo
- push deployment-only ad hoc history to the project remote
