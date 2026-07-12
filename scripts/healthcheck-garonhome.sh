#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="${FSM_DEPLOY_ROOT:-/opt/business/ai-fsm}"
LOG_DIR="${DEPLOY_ROOT}/logs"
LOG_FILE="${LOG_DIR}/healthcheck.log"
NTFY_TOPIC="${FSM_NTFY_TOPIC:-ai-fsm-garonhome}"
WEB_CONTAINER="${FSM_WEB_CONTAINER:-ai-fsm-web-1}"

# Try to load n8n SMS env for tokens/URLs (makes alerts more reliable)
for envf in /home/nick/docker/n8n-sms.env "${DEPLOY_ROOT}/env/.env" ; do
  if [[ -f "$envf" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$envf" || true
    set +a
  fi
done

mkdir -p "${LOG_DIR}"

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Resolve NTFY target: prefer token + internal (localhost from host), fallback to public
NTFY_BASE="ntfy.sh"
NTFY_AUTH=""
if [[ -n "${NTFY_TOKEN:-}" ]]; then
  # From host, ntfy is on 2586
  NTFY_HOST_PORT="localhost:2586"
  NTFY_BASE="${NTFY_HOST_PORT}"
  NTFY_AUTH="Authorization: Bearer ${NTFY_TOKEN}"
fi
NTFY_URL_BASE="http://${NTFY_BASE}"

# Check if container is running
if ! docker inspect --format='{{.State.Running}}' "${WEB_CONTAINER}" 2>/dev/null | grep -q true; then
  echo "${TIMESTAMP} status=container_down response_ms=-1" >> "${LOG_FILE}"
  _msg="ai-fsm web container is not running on garonhome (${TIMESTAMP})"
  _primary="${NTFY_URL_BASE:-http://ntfy.sh}/${NTFY_TOPIC}"
  if ! curl -sS --max-time 10 ${NTFY_AUTH:+-H "$NTFY_AUTH"} \
    -H "Title: ai-fsm DOWN on garonhome" \
    -H "Priority: urgent" \
    -H "Tags: rotating_light" \
    -d "${_msg}" \
    "${_primary}" > /dev/null; then
    # Fallback only when primary failed and was not already public ntfy.sh
    # (avoids double alerts and leaking to the public topic after a successful local publish).
    if [[ "${_primary}" != *ntfy.sh* ]]; then
      curl -sS --max-time 10 -d "${_msg}" \
        "https://ntfy.sh/${NTFY_TOPIC}" > /dev/null || true
    fi
  fi
  exit 0
fi

# Check n8n (the SMS gateway / webhook receiver)
if ! docker inspect --format='{{.State.Running}}' n8n 2>/dev/null | grep -q true; then
  echo "${TIMESTAMP} status=n8n_down response_ms=-1" >> "${LOG_FILE}"
  curl -s ${NTFY_AUTH:+-H "$NTFY_AUTH"} \
    -H "Title: n8n (SMS intake) DOWN on garonhome" \
    -H "Priority: urgent" \
    -H "Tags: rotating_light" \
    -d "n8n container is not running (${TIMESTAMP})" \
    "${NTFY_URL_BASE:-ntfy.sh}/${NTFY_TOPIC}" > /dev/null || true
fi

# Quick responsiveness check for n8n
N8N_CODE=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" http://localhost:5678 2>/dev/null || echo "000")
if [[ "$N8N_CODE" != "200" && "$N8N_CODE" != "401" && "$N8N_CODE" != "403" ]]; then
  echo "${TIMESTAMP} status=n8n_unresponsive code=${N8N_CODE}" >> "${LOG_FILE}"
  curl -s ${NTFY_AUTH:+-H "$NTFY_AUTH"} \
    -H "Title: n8n (SMS intake) unresponsive on garonhome" \
    -H "Priority: high" \
    -H "Tags: warning" \
    -d "n8n not responding properly (HTTP ${N8N_CODE}) at ${TIMESTAMP}" \
    "${NTFY_URL_BASE:-ntfy.sh}/${NTFY_TOPIC}" > /dev/null || true
fi

# Check that the Dovetails SMS workflow is active in n8n
N8N_WF_ACTIVE=$(python3 -c '
import sqlite3, sys
try:
    conn = sqlite3.connect("/home/nick/docker/n8n/database.sqlite")
    row = conn.execute("SELECT active FROM workflow_entity WHERE name LIKE \"%Dovetails%SMS%\" OR id LIKE \"%dovetailsSms%\" LIMIT 1;").fetchone()
    print(row[0] if row else 0)
    conn.close()
except Exception:
    print(0)
' 2>/dev/null || echo 0)
if [[ "$N8N_WF_ACTIVE" != "1" ]]; then
  echo "${TIMESTAMP} status=n8n_workflow_inactive" >> "${LOG_FILE}"
  curl -s ${NTFY_AUTH:+-H "$NTFY_AUTH"} \
    -H "Title: n8n SMS workflow not active" \
    -H "Priority: high" \
    -H "Tags: warning" \
    -d "Dovetails SMS ingestion workflow is inactive or not found at ${TIMESTAMP}" \
    "${NTFY_URL_BASE:-ntfy.sh}/${NTFY_TOPIC}" > /dev/null || true
fi

# Staleness using n8n's own execution data for the SMS workflow (more precise than general SMS logs)
LAST_N8N_SMS=$(python3 -c '
import sqlite3, sys
try:
    conn = sqlite3.connect("/home/nick/docker/n8n/database.sqlite")
    row = conn.execute("""
        SELECT max(e.startedAt) FROM execution_entity e
        JOIN workflow_entity w ON e.workflowId = w.id
        WHERE (w.name LIKE \"%Dovetails%SMS%\" OR w.id LIKE \"%dovetailsSms%\")
          AND e.status = \"success\"
    """).fetchone()
    print(row[0] if row and row[0] else "")
    conn.close()
except Exception:
    print("")
' 2>/dev/null || echo "")
if [[ -n "$LAST_N8N_SMS" ]]; then
  LAST_EPOCH=$(date -d "$LAST_N8N_SMS" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE_H=$(( (NOW_EPOCH - LAST_EPOCH) / 3600 ))
  if (( AGE_H > 48 )); then
    curl -s ${NTFY_AUTH:+-H "$NTFY_AUTH"} \
      -H "Title: SMS intake quiet >48h" \
      -H "Priority: default" \
      -H "Tags: warning" \
      -d "No successful n8n SMS workflow execution in ${AGE_H}h (last: ${LAST_N8N_SMS}). Check smsgate device / n8n." \
      "${NTFY_URL_BASE:-ntfy.sh}/${NTFY_TOPIC}" > /dev/null || true
  fi
fi

# Time the health check from inside the container.
# Use 127.0.0.1 (not localhost): Alpine/BusyBox wget prefers ::1, and Next
# only listens on IPv4 0.0.0.0:3000 — localhost → Connection refused → false downs.
# Matches Docker HEALTHCHECK and deploy-garonhome.sh.
START_MS=$(date +%s%3N)
RESPONSE=$(docker exec "${WEB_CONTAINER}" wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || echo '{"status":"unreachable"}')
END_MS=$(date +%s%3N)
ELAPSED=$((END_MS - START_MS))

STATUS=$(echo "${RESPONSE}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unreachable")

echo "${TIMESTAMP} status=${STATUS} response_ms=${ELAPSED}" >> "${LOG_FILE}"

# Trim log to last 10000 lines (~35 days at 5-min intervals)
tail -10000 "${LOG_FILE}" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "${LOG_FILE}"

if [[ "${STATUS}" != "ok" ]]; then
  curl -s ${NTFY_AUTH:+-H "$NTFY_AUTH"} \
    -H "Title: ai-fsm DOWN on garonhome" \
    -H "Priority: urgent" \
    -H "Tags: rotating_light" \
    -d "Health check failed: status=${STATUS} (${TIMESTAMP})" \
    "${NTFY_URL_BASE:-ntfy.sh}/${NTFY_TOPIC}" > /dev/null || true
fi

# Check ntfy (the alert channel itself)
if ! docker inspect --format='{{.State.Running}}' ntfy 2>/dev/null | grep -q true; then
  echo "${TIMESTAMP} status=ntfy_down" >> "${LOG_FILE}"
  # last resort: try public if internal down
  curl -s -d "ntfy container down - alerts may be lost (${TIMESTAMP})" \
    "ntfy.sh/${NTFY_TOPIC}" > /dev/null || true
fi
