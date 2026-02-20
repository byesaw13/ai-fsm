# Production Readiness Checklist

Pre-flight validation before deploying ai-fsm to production.

---

## 1. Quality Gates

| Gate | Command | Pass Criteria |
|------|---------|---------------|
| Lint | `pnpm lint` | No errors |
| Typecheck | `pnpm typecheck` | No errors |
| Build | `pnpm build` | Completes without error |
| Tests | `pnpm test` | All pass (skips allowed) |

**Status:** ☐ All gates pass

---

## 2. Security

| Item | Check | Status |
|------|-------|--------|
| AUTH_SECRET | Set in `.env`, min 32 chars | ☐ |
| Secure cookies | `SECURE_COOKIE=true` in prod | ☐ |
| Rate limiting | Login endpoint limited | ☐ |
| Security headers | CSP, X-Frame-Options set | ☐ |
| Password complexity | Min 8 chars enforced | ☐ |
| No secrets in code | `.env` not committed | ☐ |

**Status:** ☐ All security items verified

---

## 3. Data Integrity

| Item | Check | Status |
|------|-------|--------|
| RLS policies | Enabled on all tables | ☐ |
| Foreign keys | All constraints valid | ☐ |
| Audit logging | Writes on insert/update/delete | ☐ |
| Migrations | All applied in order | ☐ |

**Verify:**
```bash
docker exec ai-fsm-db psql -U postgres -d ai_fsm -c "SELECT relname FROM pg_class WHERE relrowsecurity = true;"
```

**Status:** ☐ Data integrity verified

---

## 4. Pi4 Infrastructure

| Item | Requirement | Status |
|------|-------------|--------|
| Memory | 8GB RAM preferred, swap enabled | ☐ |
| Storage | External SSD for PostgreSQL data | ☐ |
| Docker | Docker + Compose plugin installed | ☐ |
| Images | ARM64 images pulled | ☐ |

**Verify:**
```bash
docker compose -f infra/compose.pi.yml config
docker images | grep ai-fsm
```

**Status:** ☐ Pi4 infrastructure ready

---

## 5. Log Rotation

Docker Compose log rotation configured in `compose.pi.yml`:

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

**Status:** ☐ Log rotation configured

---

## 6. Backup & Recovery

| Item | Check | Status |
|------|-------|--------|
| Backup script | `/home/pi/scripts/backup_db.sh` exists | ☐ |
| Cron job | Daily backup scheduled | ☐ |
| Restore drill | Completed and logged | ☐ |
| Offsite backup | rclone or rsync configured | ☐ |

**Drill command:**
```bash
# Run validation drill per docs/BACKUP_RUNBOOK.md
/home/pi/scripts/backup_db.sh
docker exec -it ai-fsm-db psql -U postgres -d ai_fsm -c "SELECT count(*) FROM users;"
```

**Status:** ☐ Backup validated

---

## 7. Observability

| Item | Check | Status |
|------|-------|--------|
| Structured logging | JSON output to stdout | ☐ |
| Health endpoint | `/api/health` returns 200 | ☐ |
| Worker logging | Poll iterations logged | ☐ |

**Verify:**
```bash
curl -sf http://localhost:3000/api/health | jq .
docker logs ai-fsm-worker --tail 20
```

**Status:** ☐ Observability configured

---

## 8. Documentation

| Doc | Purpose | Status |
|-----|---------|--------|
| DEPLOYMENT_RUNBOOK.md | Step-by-step deployment | ☐ |
| BACKUP_RUNBOOK.md | Backup/restore procedures | ☐ |
| INCIDENT_RESPONSE_RUNBOOK.md | Failure recovery | ☐ |

**Status:** ☐ Documentation complete

---

## Go/No-Go Decision

**Date:** ________________

**All sections pass:** ☐ Yes ☐ No

**Approver:** ________________

**Notes:**

_______________________________________________

---

## Known Limitations (MVP)

- No WAL archiving / PITR (RPO = 24h max)
- No database replication / standby
- No backup encryption at rest
- Single-node deployment (no horizontal scaling)
