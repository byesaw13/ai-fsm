#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${FSM_DEPLOY_ROOT:-/opt/business/ai-fsm}"
LOG_DIR="${DEPLOY_ROOT}/logs"
LOG_FILE="${LOG_DIR}/healthcheck.log"
NTFY_TOPIC="${FSM_NTFY_TOPIC:-ai-fsm-garonhome}"
WEB_CONTAINER="${FSM_WEB_CONTAINER:-ai-fsm-web-1}"

mkdir -p "${LOG_DIR}"

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Check if container is running
if ! docker inspect --format='{{.State.Running}}' "${WEB_CONTAINER}" 2>/dev/null | grep -q true; then
  echo "${TIMESTAMP} status=container_down response_ms=-1" >> "${LOG_FILE}"
  curl -s -d "ai-fsm web container is not running on garonhome (${TIMESTAMP})" \
    "ntfy.sh/${NTFY_TOPIC}" > /dev/null
  exit 0
fi

# Time the health check from inside the container
START_MS=$(date +%s%3N)
RESPONSE=$(docker exec "${WEB_CONTAINER}" wget -qO- http://localhost:3000/api/health 2>/dev/null || echo '{"status":"unreachable"}')
END_MS=$(date +%s%3N)
ELAPSED=$((END_MS - START_MS))

STATUS=$(echo "${RESPONSE}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unreachable")

echo "${TIMESTAMP} status=${STATUS} response_ms=${ELAPSED}" >> "${LOG_FILE}"

# Trim log to last 10000 lines (~35 days at 5-min intervals)
tail -10000 "${LOG_FILE}" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "${LOG_FILE}"

if [[ "${STATUS}" != "ok" ]]; then
  curl -s \
    -H "Title: ai-fsm DOWN on garonhome" \
    -H "Priority: urgent" \
    -H "Tags: rotating_light" \
    -d "Health check failed: status=${STATUS} (${TIMESTAMP})" \
    "ntfy.sh/${NTFY_TOPIC}" > /dev/null
fi
