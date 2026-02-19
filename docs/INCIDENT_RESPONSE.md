# Incident Response — ai-fsm Pi4

**Authoritative reference** for triage, diagnosis, recovery, and escalation for the ai-fsm application
running on a Raspberry Pi 4 with Docker Compose.

> This document consolidates and supersedes `docs/INCIDENT_RESPONSE_RUNBOOK.md`.
> The older file is retained for historical reference. This file is the single authoritative path.

---

## Alert Sources

The MVP deployment has no external monitoring infrastructure. Monitoring relies on:

| Source | Command |
|--------|---------|
| Container status | `docker compose -f infra/compose.pi.yml ps` |
| All logs (JSON) | `docker compose -f infra/compose.pi.yml logs -f` |
| Error logs only | `docker compose -f infra/compose.pi.yml logs web \| jq 'select(.level=="error")'` |
| Health endpoint | `curl -sf http://localhost:3000/api/health \| jq .` |
| System resources | `htop`, `df -h`, `free -h`, `docker stats --no-stream` |
| PostgreSQL activity | `docker exec -it ai-fsm-postgres psql -U postgres -d ai_fsm -c "SELECT * FROM pg_stat_activity;"` |

### Recommended: Cron health alert

```bash
# /home/pi/scripts/healthcheck.sh — runs every 5 minutes via cron
#!/usr/bin/env bash
STATUS=$(curl -sf http://localhost:3000/api/health | jq -r '.status' 2>/dev/null || echo "unreachable")
if [ "$STATUS" != "ok" ]; then
  curl -d "ai-fsm health: $STATUS at $(date -u)" ntfy.sh/YOUR_TOPIC 2>/dev/null || true
fi
```

Cron entry: `*/5 * * * * /home/pi/scripts/healthcheck.sh >> /home/pi/logs/healthcheck.log 2>&1`

---

## Severity Levels

| Level | Criteria | Target response |
|-------|----------|-----------------|
| **P1 Critical** | App completely down; DB inaccessible; data corruption suspected | Immediate |
| **P2 High** | Core feature broken (jobs/invoices inaccessible); degraded health check | < 1 hour |
| **P3 Medium** | Non-critical feature broken; worker automation failures | < 4 hours |
| **P4 Low** | Performance degradation; cosmetic issues; single automation failure | Next business day |

---

## Escalation Flow

```
Health alert fires (cron / manual detection)
          │
          ▼
Assess severity (P1–P4) using table above
          │
     P1/P2 ?
    /         \
  Yes           No (P3/P4)
   │                │
   ▼                ▼
Run P1/P2       Run P3/P4
runbook below   runbook below
   │
   ▼
Can I recover in < 30 min?
    /         \
  Yes           No
   │                │
   ▼                ▼
Recover &     Escalate to human operator:
log incident  - Notify via ntfy/email/SMS
              - Describe: what failed, what was tried, current state
              - Human to decide: extended outage window or restore from backup
                     │
                     ▼
              If data loss suspected:
              STOP app immediately, take snapshot, restore from backup
              See DEPLOYMENT_RUNBOOK.md § Restore Procedure
```

**Note:** This is a single-operator, self-hosted environment. Human escalation means the
Pi4 owner/operator is notified out-of-band to make decisions requiring credentials or
physical access (e.g., SD card corruption, power outage).

---

## Runbook: Application Completely Down (P1)

**Symptoms:**
- `curl http://localhost:3000/api/health` times out or returns 5xx
- All containers stopped or in crash loop

```bash
# Step 1: Check container state
docker compose -f infra/compose.pi.yml ps

# Step 2: Check recent crash cause
docker compose -f infra/compose.pi.yml logs --tail=200 web
docker compose -f infra/compose.pi.yml logs --tail=200 worker

# Step 3: Check system resources
df -h          # disk full?
free -h        # OOM?
docker stats --no-stream  # which service is over limit?
```

**Recovery:**

```bash
# Restart all services
docker compose -f infra/compose.pi.yml restart

# If disk full — clear Docker cache
docker system prune -f

# If OOM — add/increase swap and restart
sudo dphys-swapfile swapoff
# Edit /etc/dphys-swapfile: CONF_SWAPSIZE=1024
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
docker compose -f infra/compose.pi.yml restart
```

---

## Runbook: Database Inaccessible (P1)

**Symptoms:**
- Health check returns `{"status":"degraded","checks":{"db":"fail"}}`
- API routes return 500 INTERNAL_ERROR

```bash
# Step 1: Check DB container
docker compose -f infra/compose.pi.yml ps postgres
docker compose -f infra/compose.pi.yml logs --tail=100 postgres

# Step 2: Test connectivity
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm -c "SELECT 1;"

# Step 3: Check lock contention
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm \
  -c "SELECT pid, query, state, wait_event_type, wait_event, now() - query_start AS duration
      FROM pg_stat_activity
      WHERE state != 'idle'
      ORDER BY duration DESC;"
```

**Recovery:**

```bash
# Restart DB container
docker compose -f infra/compose.pi.yml restart postgres
sleep 10
curl http://localhost:3000/api/health | jq .

# Kill a specific blocking query (use pid from above)
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm \
  -c "SELECT pg_terminate_backend(<pid>);"

# If data corruption is suspected → STOP. Do not restart.
# Follow the data corruption runbook below.
```

---

## Runbook: Suspected Data Corruption (P1)

**Symptoms:**
- Unexpected deletes or mutations visible in audit_log
- Row counts drastically lower than expected
- Constraint violations on reads

```bash
# 1. STOP immediately to prevent further writes
docker compose -f infra/compose.pi.yml stop web worker

# 2. Take a snapshot of the (possibly corrupt) current state
docker exec ai-fsm-postgres pg_dump --username=postgres --format=custom ai_fsm \
  > /home/pi/backups/incident_$(date +%Y%m%d_%H%M%S).dump

# 3. Inspect audit_log for unexpected recent activity
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm \
  -c "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50;"

# 4. Restore from last known-good backup
# See DEPLOYMENT_RUNBOOK.md § Restore Procedure

# 5. Log incident in docs/DECISION_LOG.md
```

---

## Runbook: High Memory / OOM (P2)

**Symptoms:**
- Services randomly restarting
- `dmesg | grep -i oom` shows OOM killer events

```bash
dmesg | grep -i "oom\|killed process" | tail -20
free -h
docker stats --no-stream
```

**Recovery:**

```bash
# Reduce Next.js heap (set in compose.pi.yml or .env)
# NODE_OPTIONS=--max-old-space-size=256

# Restart web to reclaim memory
docker compose -f infra/compose.pi.yml restart web

# Add or increase swap
sudo dphys-swapfile swapoff
# Edit /etc/dphys-swapfile: CONF_SWAPSIZE=1024
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
```

---

## Runbook: Disk Full (P1)

**Symptoms:**
- DB writes failing; containers crashing; logs show ENOSPC errors

```bash
df -h
du -sh /var/lib/docker/*
docker system df
```

**Recovery:**

```bash
# Remove unused Docker images, volumes, build cache
docker system prune -af --volumes

# Remove old backups beyond the 7-day retention window
find /home/pi/backups -name "*.dump" -mtime +7 -delete

# If logs are filling disk, confirm log rotation is configured in compose.pi.yml:
# logging:
#   driver: json-file
#   options:
#     max-size: "50m"
#     max-file: "3"
```

---

## Runbook: Worker Automation Failures (P3)

**Symptoms:**
- Visit reminders or invoice follow-ups not being sent
- Worker logs show errors processing automations

```bash
# Check worker error logs (structured JSON)
docker compose -f infra/compose.pi.yml logs worker | jq 'select(.level=="error")'

# Check automation table for stuck jobs
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm \
  -c "SELECT id, type, enabled, next_run_at, last_run_at
      FROM automations
      ORDER BY next_run_at;"

# Check recent automation audit entries
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm \
  -c "SELECT entity_type, action, created_at
      FROM audit_log
      WHERE entity_type IN ('visit_reminder', 'invoice_followup')
      ORDER BY created_at DESC
      LIMIT 20;"
```

**Recovery:**

```bash
# Restart worker
docker compose -f infra/compose.pi.yml restart worker

# Manually reset a stuck automation's next_run_at
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm \
  -c "UPDATE automations SET next_run_at = now() WHERE id = '<automation-id>';"
```

---

## Runbook: Rate Limit / Login Loop (P3)

**Symptoms:**
- Users locked out after bad credentials or automated testing
- Logs show repeated 429 RATE_LIMITED responses

```bash
docker compose -f infra/compose.pi.yml logs web | \
  jq 'select(.msg | test("Login|rate")) | {ts: .time, level, msg}'
```

**Recovery:**

The rate limiter is **in-process** (Map-based, resets on restart). No data is lost.

```bash
docker compose -f infra/compose.pi.yml restart web
```

---

## Rollback Plan

If a deployment update causes a P1/P2 incident, roll back immediately.
Full procedure: [docs/DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) § Rollback Plan.

**Quick rollback summary:**

1. Identify the previous image tag (`docker image ls ghcr.io/your-org/ai-fsm-web`).
2. Edit `infra/compose.pi.yml` to pin the previous tag on `web` and `worker`.
3. Run `docker compose -f infra/compose.pi.yml up -d --force-recreate web worker`.
4. Verify health endpoint returns `{"status":"ok"}`.
5. If a database migration was applied and must be reverted, restore from the pre-upgrade backup.
6. Log the rollback in `docs/DECISION_LOG.md`.

---

## Post-Incident Checklist

- [ ] Root cause identified and documented
- [ ] Recovery steps recorded in `docs/DECISION_LOG.md`
- [ ] Backup integrity verified after recovery
- [ ] Log rotation confirmed not to have contributed to disk issue
- [ ] Health-check cron confirmed running (`crontab -l`)
- [ ] Any temporary CI/protection bypass (see `docs/CI_GOVERNANCE.md`) restored
- [ ] Operator notified if data was lost or service was down > 1 hour
- [ ] Monitoring gap addressed — add alert if detection was slow

---

## Quick Reference Commands

```bash
# Container status
docker compose -f infra/compose.pi.yml ps

# Tail all logs (JSON)
docker compose -f infra/compose.pi.yml logs -f | jq .

# Filter errors only
docker compose -f infra/compose.pi.yml logs web | jq 'select(.level=="error")'

# Health check
curl -sf http://localhost:3000/api/health | jq .

# DB connection test
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm -c "SELECT 1;"

# Active DB queries
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm \
  -c "SELECT pid, query_start, state, query FROM pg_stat_activity WHERE state != 'idle';"

# Kill blocking query
docker exec -it ai-fsm-postgres psql --username=postgres --dbname=ai_fsm \
  -c "SELECT pg_terminate_backend(<pid>);"

# Resource usage
df -h && free -h && docker stats --no-stream

# Take an emergency backup
docker exec ai-fsm-postgres pg_dump --username=postgres --format=custom ai_fsm \
  > /home/pi/backups/emergency_$(date +%Y%m%d_%H%M%S).dump
```
