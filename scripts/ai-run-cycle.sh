#!/usr/bin/env bash
set -euo pipefail

TASK_ID=${1:-}
if [[ -z "$TASK_ID" ]]; then
  echo "usage: scripts/ai-run-cycle.sh <task-id>"
  exit 1
fi

echo "AI run cycle start for task: $TASK_ID"
echo "1) implement task"
echo "2) run gates"
pnpm gate
echo "3) update docs/PHASED_BACKLOG.yaml status manually or via automation"
