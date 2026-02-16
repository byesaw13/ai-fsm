#!/usr/bin/env bash
set -euo pipefail

REGISTRY=${REGISTRY:-ghcr.io/your-org}
TAG=${TAG:-latest}

docker buildx build --platform linux/amd64,linux/arm64 -t "$REGISTRY/ai-fsm-web:$TAG" -f apps/web/Dockerfile . --push
docker buildx build --platform linux/amd64,linux/arm64 -t "$REGISTRY/ai-fsm-worker:$TAG" -f services/worker/Dockerfile . --push
