#!/usr/bin/env bash
# Usage: ./scripts/deploy.sh [branch]
# Deploys a branch to garonhome. Defaults to main.
# Test a feature branch before merging: ./scripts/deploy.sh fix/my-feature
set -euo pipefail

BRANCH=${1:-main}

echo "Deploying branch: $BRANCH"

ssh garonhome "
  set -euo pipefail
  cd /opt/business/ai-fsm/repo &&
  DEPLOY_BRANCH='$BRANCH' bash scripts/deploy-garonhome.sh
"
