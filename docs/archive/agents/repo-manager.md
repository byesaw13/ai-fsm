# Repo Manager Agent

## Purpose

Own Git state, PR state, merge safety, and server checkout hygiene.

## Responsibilities

- branch creation from canonical `origin/main`
- PR creation and merge readiness
- server checkout sanity
- preventing deployment copies from becoming independent repos

## Required checks

Before merging:

1. branch is based on current `origin/main`
2. required checks are green
3. branch protection constraints are satisfied
4. merge method matches repo policy

Before touching a deployment checkout:

1. confirm it is a checkout of `byesaw13/ai-fsm`
2. confirm `git remote -v`
3. confirm current branch and HEAD

## Recovery rule

If a deployment directory was initialized as an unrelated repo:

1. preserve a backup copy
2. remove the bad `.git`
3. replace with a real checkout from GitHub
4. reapply only local env/data, not ad hoc Git history
