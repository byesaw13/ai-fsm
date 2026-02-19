# Incident Response Runbook — Pi4 Self-Hosted Deployment

## Scope

This runbook covers triage, diagnosis, and recovery for the ai-fsm application running on a
Raspberry Pi 4 with Docker Compose. It is intended for a single-operator environment.

---

## Alert Sources

Since there is no external alerting infrastructure in the MVP, monitoring relies on:

| Source | How to access |
|--------|---------------|
| Docker Compose logs | `docker compose logs -f --tail=100` |
| Structured JSON logs | `docker compose logs web | jq .` |
| Health endpoint | `curl http://localhost:3000/api/health` |
| System metrics | `htop`, `df -h`, `free -h` |
| PostgreSQL activity | `psql -c "SELECT * FROM pg_stat_activity;"` |

**Recommended**: Set up a cron-based health check that pings `/api/health` every 5 minutes and
sends a notification (e.g. email, SMS via ntfy.sh, or Slack webhook) on failure:

```bash
# /home/pi/scripts/healthcheck.sh
#!/usr/bin/env bash
STATUS=$(curl -sf http://localhost:3000/api/health | jq -r '.status' 2>/dev/null || echo "unreachable")
if [ "$STATUS" != "ok" ]; then
  curl -d "ai-fsm health: $STATUS at $(date -u)" ntfy.sh/YOUR_TOPIC
fi
```

Add to crontab: `*/5 * * * * /home/pi/scripts/healthcheck.sh`

---

## Severity Levels

| Level | Criteria | Response time |
|-------|----------|---------------|
| **P1 Critical** | App completely down, DB inaccessible, data corruption suspected | Immediate |
| **P2 High** | Core feature broken (jobs/invoices inaccessible), degraded health check | < 1 hour |
| **P3 Medium** | Non-critical feature broken, worker automation failures | < 4 hours |
| **P4 Low** | Performance degradation, cosmetic issues, single automation failure | Next business day |

---

## Runbook: Application Completely Down (P1)

### Symptoms
- `curl http://localhost:3000/api/health` times out or returns 503
- All containers stopped/crashed

### Triage steps

```bash
# 1. Check container status
docker compose -f compose.pi.yml ps

# 2. Check recent logs for crash cause
docker compose -f compose.pi.yml logs --tail=200 web
docker compose -f compose.pi.yml logs --tail=200 worker

# 3. Check system resources
df -h          # disk full?
free -h        # OOM?
htop           # CPU pegged?
```

### Recovery

```bash
# Restart all services
docker compose -f compose.pi.yml restart

# If disk full — clear Docker build cache / old images
docker system prune -f

# If OOM — check and increase swap on Pi4
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile   # CONF_SWAPSIZE=1024
sudo dphys-swapfile swapon
```

---

## Runbook: Database Inaccessible (P1)

### Symptoms
- Health check returns `{"status":"degraded","checks":{"db":"fail"}}`
- API routes return 500 INTERNAL_ERROR

### Triage steps

```bash
# 1. Check DB container
docker compose -f compose.pi.yml ps db
docker compose -f compose.pi.yml logs --tail=100 db

# 2. Can we connect?
docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm -c "SELECT 1;"

# 3. Check for lock contention
docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm \
  -c "SELECT pid, query, state, wait_event_type, wait_event, now() - query_start AS duration
      FROM pg_stat_activity
      WHERE state != 'idle'
      ORDER BY duration DESC;"
```

### Recovery

```bash
# Restart DB container
docker compose -f compose.pi.yml restart db
sleep 10

# Verify health
curl http://localhost:3000/api/health | jq .

# If data corruption is suspected — STOP and restore from backup
# See docs/BACKUP_RUNBOOK.md
```

---

## Runbook: Worker Automation Failures (P3)

### Symptoms
- Visit reminders or invoice follow-ups not being sent
- Worker logs show `invoice-followup: failed to process automation` or similar

### Triage steps

```bash
# 1. Check worker logs (structured JSON)
docker compose -f compose.pi.yml logs worker | jq 'select(.level=="error")'

# 2. Check automation table for stuck next_run_at
docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm \
  -c "SELECT id, type, enabled, next_run_at, last_run_at
      FROM automations
      ORDER BY next_run_at;"

# 3. Check audit_log for recent automation activity
docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm \
  -c "SELECT entity_type, action, created_at
      FROM audit_log
      WHERE entity_type IN ('visit_reminder', 'invoice_followup')
      ORDER BY created_at DESC
      LIMIT 20;"
```

### Recovery

```bash
# Restart worker
docker compose -f compose.pi.yml restart worker

# Manually reset a stuck automation's next_run_at if needed
docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm \
  -c "UPDATE automations SET next_run_at = now() WHERE id = '<automation-id>';"
```

---

## Runbook: High Memory / OOM on Pi4 (P2)

### Symptoms
- Services randomly restarting
- `dmesg | grep -i oom` shows OOM killer events

### Triage

```bash
dmesg | grep -i "oom\|killed process" | tail -20
free -h
docker stats --no-stream
```

### Recovery

```bash
# Reduce Next.js worker threads (if not already done)
# Set in compose.pi.yml environment:
#   NODE_OPTIONS: "--max-old-space-size=256"

# Restart to reclaim memory
docker compose -f compose.pi.yml restart web

# Add/increase swap
sudo dphys-swapfile swapoff
# Edit /etc/dphys-swapfile: CONF_SWAPSIZE=1024
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
```

---

## Runbook: Disk Full (P1)

### Symptoms
- DB writes failing, containers crashing
- `df -h` shows `/` or `/var` at 100%

### Triage

```bash
df -h
du -sh /var/lib/docker/*
docker system df
```

### Recovery

```bash
# Remove unused Docker images and volumes
docker system prune -af --volumes

# Remove old backup files
find /home/pi/backups -name "*.dump" -mtime +3 -delete

# If logs are filling disk
docker compose -f compose.pi.yml logs --no-log-prefix web > /dev/null  # just to flush buffer
# Configure log rotation in compose.pi.yml:
# logging:
#   driver: json-file
#   options:
#     max-size: "50m"
#     max-file: "3"
```

---

## Runbook: Rate Limit Exhausted / Login Loop (P3)

### Symptoms
- Users locked out after automated testing or bad credentials
- Logs show repeated RATE_LIMITED 429 responses

### Triage

```bash
docker compose -f compose.pi.yml logs web | jq 'select(.msg | contains("Login")) | {ts, level, traceId}'
```

### Recovery

The rate limiter is **in-process** (Map-based, not Redis). A simple web container restart clears all rate limit state:

```bash
docker compose -f compose.pi.yml restart web
```

> Note: This also clears any other in-memory state. No data is lost (DB-backed).

---

## Runbook: Suspected Data Corruption (P1)

### Immediately

1. **Stop the application** to prevent further writes:
   ```bash
   docker compose -f compose.pi.yml stop web worker
   ```
2. **Take a snapshot** of the current (possibly corrupt) state:
   ```bash
   docker exec ai-fsm-db pg_dump --username=postgres --format=custom ai_fsm \
     > /home/pi/backups/incident_$(date +%Y%m%d_%H%M%S).dump
   ```
3. **Assess scope**: inspect audit_log for unexpected deletes or modifications.
   ```bash
   docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm \
     -c "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50;"
   ```
4. **Restore from last known-good backup** (see docs/BACKUP_RUNBOOK.md).
5. **Log the incident** in `docs/DECISION_LOG.md`.

---

## Post-Incident Checklist

- [ ] Root cause identified
- [ ] Recovery steps documented in `docs/DECISION_LOG.md`
- [ ] Monitoring gap addressed (add alert if detection was slow)
- [ ] Backup integrity verified after recovery
- [ ] Any temporary bypass (e.g., branch protection) restored (see CI_GOVERNANCE.md)
- [ ] Stakeholder notified if data was lost or service was down > 1 hour

---

## Useful Commands Quick Reference

```bash
# Container status
docker compose -f compose.pi.yml ps

# Tail all logs (JSON)
docker compose -f compose.pi.yml logs -f | jq .

# Filter errors only
docker compose -f compose.pi.yml logs web | jq 'select(.level=="error")'

# Health check
curl -s http://localhost:3000/api/health | jq .

# DB connection check
docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm -c "SELECT 1;"

# Active DB queries
docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm \
  -c "SELECT pid, query_start, state, query FROM pg_stat_activity WHERE state != 'idle';"

# Kill a blocking query
docker exec -it ai-fsm-db psql --username=postgres --dbname=ai_fsm \
  -c "SELECT pg_terminate_backend(<pid>);"

# Resource usage
df -h && free -h && docker stats --no-stream
```
