#!/usr/bin/env bash
# Print uptime % and avg response time from healthcheck.log
# Usage: slo-report.sh [hours]   (default: 24)

DEPLOY_ROOT="${FSM_DEPLOY_ROOT:-/opt/business/ai-fsm}"
LOG_FILE="${DEPLOY_ROOT}/logs/healthcheck.log"
HOURS="${1:-24}"

if [[ ! -f "${LOG_FILE}" ]]; then
  echo "no healthcheck log found at ${LOG_FILE}"
  exit 1
fi

CUTOFF=$(date -u -d "${HOURS} hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || date -u -v-"${HOURS}"H +%Y-%m-%dT%H:%M:%SZ)

awk -v cutoff="${CUTOFF}" '
  $1 >= cutoff {
    total++
    split($2, a, "="); status = a[2]
    split($3, b, "="); ms = b[2]
    if (status == "ok") { ok++; if (ms >= 0) { sum_ms += ms; count_ms++ } }
    else { fail++ }
  }
  END {
    if (total == 0) { print "no data in window"; exit 1 }
    uptime_pct = ok / total * 100
    avg_ms = (count_ms > 0) ? sum_ms / count_ms : -1
    printf "window:       last %s hours\n", ENVIRON["HOURS"]
    printf "checks:       %d total, %d ok, %d failed\n", total, ok, fail+0
    printf "uptime:       %.2f%%\n", uptime_pct
    if (avg_ms >= 0) printf "avg response: %d ms\n", avg_ms
  }
' HOURS="${HOURS}" "${LOG_FILE}"
