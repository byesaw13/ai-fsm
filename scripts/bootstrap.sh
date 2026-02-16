#!/usr/bin/env bash
set -euo pipefail

cp -n .env.example .env || true
pnpm install
docker compose -f infra/compose.dev.yml up -d postgres redis
export DATABASE_URL=${DATABASE_URL:-postgresql://ai_fsm:ai_fsm_dev_password@localhost:5432/ai_fsm}
pnpm db:migrate || true

echo "bootstrap complete"
