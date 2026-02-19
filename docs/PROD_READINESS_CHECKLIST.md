# Production Readiness Checklist — ai-fsm

**Version:** 1.1
**Last updated:** 2026-02-19
**Target deployment:** Raspberry Pi 4 (compose.pi.yml) and VPS (compose.prod.yml)

This checklist is the single authoritative go/no-go gate before any production cutover or major release.
Every item must have an explicit **PASS** or **FAIL** recorded before sign-off.

---

## Section 1 — Code Quality Gates

All four CI gates must be green on the release commit. These run automatically in GitHub Actions.

| # | Gate | Pass Criteria | Result |
|---|------|---------------|--------|
| 1.1 | **Lint** | `pnpm lint` exits 0, zero ESLint errors or warnings | ☐ PASS / ☐ FAIL |
| 1.2 | **Typecheck** | `pnpm typecheck` exits 0, zero TypeScript errors | ☐ PASS / ☐ FAIL |
| 1.3 | **Build** | `pnpm build` completes without error; all Next.js routes compile | ☐ PASS / ☐ FAIL |
| 1.4 | **Unit + DB-integration tests** | `pnpm test` — all Tier 1 and Tier 2 tests pass; Tier 3 skips are listed in TEST_MATRIX.md | ☐ PASS / ☐ FAIL |

**How to run locally:**
```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

**Expected test output (Tier 1 + Tier 2 in CI):**
```
Tests  ~222 passed | ~48 skipped
```
Skips listed in `docs/TEST_MATRIX.md § CI Skip Inventory` are expected. Any unexpected skip is a FAIL.

**CI evidence location:** GitHub Actions run on the release PR (link the run URL here before sign-off).

---

## Section 2 — Security Gates

| # | Check | Pass Criteria | Result |
|---|-------|---------------|--------|
| 2.1 | **AUTH_SECRET strength** | `.env` value is ≥ 32 chars; startup logs must not show `[startup]` validation errors | ☐ PASS / ☐ FAIL |
| 2.2 | **Cookie flags** | Session cookies contain `HttpOnly; Secure; SameSite=Lax` in production responses | ☐ PASS / ☐ FAIL |
| 2.3 | **Security response headers** | `curl -sI http://localhost:3000` output includes `x-frame-options`, `x-content-type-options`, `referrer-policy`, `permissions-policy`, `content-security-policy` (case-insensitive) | ☐ PASS / ☐ FAIL |
| 2.4 | **Rate limiting — login** | Six rapid login attempts from the same IP return 429 with `Retry-After` header | ☐ PASS / ☐ FAIL |
| 2.5 | **RLS cross-tenant isolation** | Manual or automated test confirms tenant A cannot read tenant B's jobs, visits, estimates, invoices | ☐ PASS / ☐ FAIL |
| 2.6 | **No secrets in image** | `docker inspect ghcr.io/your-org/ai-fsm-web:latest` environment contains no credential values; secrets loaded from `.env` at runtime only | ☐ PASS / ☐ FAIL |
| 2.7 | **Audit log writing** | After a job transition, `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 5;` shows the event | ☐ PASS / ☐ FAIL |

**Verification commands:**
```bash
# 2.1 — AUTH_SECRET length
awk -F= '/^AUTH_SECRET/{print length($2), "chars"}' .env
# Expected: 32 chars or more

# 2.3 — Security headers
curl -sI http://localhost:3000 | grep -iE "x-frame-options|x-content-type-options|referrer-policy|permissions-policy|content-security-policy"
# Expected: five header lines, one per header name

# 2.4 — Rate limiting (run 6 times in quick succession)
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" -d '{"email":"x","password":"y"}'
done
# Expected: first ~5 return 401 (bad credentials), 6th returns 429

# 2.7 — Audit log
docker exec -it ai-fsm-postgres psql -U postgres -d ai_fsm \
  -c "SELECT entity_type, action, created_at FROM audit_log ORDER BY created_at DESC LIMIT 5;"
```

---

## Section 3 — Data Integrity Gates

| # | Check | Pass Criteria | Result |
|---|-------|---------------|--------|
| 3.1 | **All migrations applied** | `docker exec ai-fsm-postgres psql -U postgres -d ai_fsm -c "\dt"` lists all expected tables (users, accounts, clients, properties, jobs, visits, estimates, estimate_line_items, invoices, invoice_line_items, payments, automations, audit_log) | ☐ PASS / ☐ FAIL |
| 3.2 | **RLS enabled on all tables** | `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;` returns 0 rows | ☐ PASS / ☐ FAIL |
| 3.3 | **Workflow invariant triggers** | Attempt an invalid status transition via API; response is 409 / INVALID_TRANSITION | ☐ PASS / ☐ FAIL |
| 3.4 | **Estimate→invoice immutability** | After converting an estimate to invoice, PATCH `estimate.line_items` returns 409 | ☐ PASS / ☐ FAIL |
| 3.5 | **Payment sync trigger** | Record a full payment on an invoice; invoice status auto-updates to `paid` | ☐ PASS / ☐ FAIL |

**Verification commands:**
```bash
# 3.1 — Table list
docker exec -it ai-fsm-postgres psql -U postgres -d ai_fsm -c "\dt public.*"
# Expected: 13 tables including users, accounts, clients, properties, jobs, visits,
#           estimates, estimate_line_items, invoices, invoice_line_items,
#           payments, automations, audit_log

# 3.2 — RLS on every table (must return 0 rows)
docker exec -it ai-fsm-postgres psql -U postgres -d ai_fsm \
  -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;"
# Expected: 0 rows

# 3.5 — Payment trigger
docker exec -it ai-fsm-postgres psql -U postgres -d ai_fsm \
  -c "SELECT id, status, paid_cents, total_cents FROM invoices ORDER BY created_at DESC LIMIT 5;"
```

---

## Section 4 — Infrastructure and Deployment Gates

### 4a — Pi4 Operating Limits

The Pi4 deployment profile (`infra/compose.pi.yml`) enforces hard memory limits. Verify these are respected.

| Service | Memory limit | Acceptable usage at idle |
|---------|-------------|--------------------------|
| `web` | 700 MB | < 300 MB |
| `worker` | 256 MB | < 128 MB |
| `postgres` | 900 MB | < 500 MB |
| `redis` | 128 MB | < 64 MB |
| **Total** | **~2 GB** | **< 1 GB at idle** |

**Check usage:**
```bash
docker stats --no-stream
```

| # | Check | Pass Criteria | Result |
|---|-------|---------------|--------|
| 4.1 | **All containers running** | `docker compose -f infra/compose.pi.yml ps` shows all four services `Up` | ☐ PASS / ☐ FAIL |
| 4.2 | **Memory within limits** | `docker stats --no-stream` shows no service exceeding its limit | ☐ PASS / ☐ FAIL |
| 4.3 | **Postgres healthcheck green** | Postgres service shows `healthy` in `docker compose ps` | ☐ PASS / ☐ FAIL |
| 4.4 | **Swap enabled on Pi4** | `free -h` shows swap > 0 (recommended: ≥ 1 GB via dphys-swapfile) | ☐ PASS / ☐ FAIL |
| 4.5 | **Storage headroom** | `df -h /` shows < 70% usage; `/var/lib/docker` has ≥ 5 GB free | ☐ PASS / ☐ FAIL |
| 4.6 | **ARM64 images** | All images were built with `platform: linux/arm64` | ☐ PASS / ☐ FAIL |

### 4b — Smoke Tests (post-deploy)

| # | Check | Pass Criteria | Result |
|---|-------|---------------|--------|
| 4.7 | **Health endpoint** | `curl -sf http://localhost:3000/api/health` returns `{"status":"ok","checks":{"db":"ok"}}` | ☐ PASS / ☐ FAIL |
| 4.8 | **Login smoke test** | `POST /api/v1/auth/login` with valid credentials returns 200 and a `Set-Cookie` header | ☐ PASS / ☐ FAIL |
| 4.9 | **Protected route redirect** | Unauthenticated `GET /app/jobs` returns HTTP 307 with `Location: /login` | ☐ PASS / ☐ FAIL |
| 4.10 | **Jobs list accessible** | Authenticated admin user can load `/app/jobs` and receives HTTP 200 | ☐ PASS / ☐ FAIL |
| 4.11 | **Worker alive** | `docker compose -f infra/compose.pi.yml logs worker` shows polling heartbeat messages, no crash loop | ☐ PASS / ☐ FAIL |

**Verification commands:**
```bash
# 4.1 — Container status
docker compose -f infra/compose.pi.yml ps
# Expected: all four services show "Up" and postgres shows "(healthy)"

# 4.2 — Memory usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
# Expected: no service at or near its limit (web <700MB, worker <256MB, postgres <900MB, redis <128MB)

# 4.4 — Swap
free -h
# Expected: Swap row shows non-zero total (≥ 1.0Gi)

# 4.5 — Disk
df -h / && df -h /var/lib/docker 2>/dev/null || df -h /var
# Expected: < 70% usage

# 4.7 — Health endpoint
curl -sf http://localhost:3000/api/health
# Expected output:
# {"status":"ok","service":"web","checks":{"db":"ok"},"ts":"<ISO-timestamp>","traceId":"<uuid>"}

# 4.8 — Login smoke test
curl -si -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<seed-password>"}' | head -20
# Expected: HTTP/1.1 200 OK, Set-Cookie: session=...

# 4.9 — Redirect for unauthenticated request
curl -so /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/app/jobs
# Expected: 307 http://localhost:3000/login

# 4.11 — Worker heartbeat
docker compose -f infra/compose.pi.yml logs --tail=20 worker
# Expected: JSON log lines with msg containing "poll" or "heartbeat", no ERROR-level crash loops

---

## Section 5 — Log Rotation and Backup

| # | Check | Pass Criteria | Result |
|---|-------|---------------|--------|
| 5.1 | **Docker log rotation in compose files** | `infra/compose.pi.yml` and `infra/compose.prod.yml` each have `logging.driver: json-file` with `max-size: 50m` / `max-file: 3` on web, worker, postgres (pre-configured as of post-P5 hardening PR) | ☐ PASS / ☐ FAIL |
| 5.2 | **Backup cron installed** | `crontab -l` on Pi4 host shows `0 2 * * * /home/pi/scripts/backup_db.sh` (or equivalent) | ☐ PASS / ☐ FAIL |
| 5.3 | **Backup script executable** | `/home/pi/scripts/backup_db.sh` exists and `bash -n` reports no syntax errors | ☐ PASS / ☐ FAIL |
| 5.4 | **Test backup runs clean** | Manual run of backup script writes a `.dump` file and exits 0 | ☐ PASS / ☐ FAIL |
| 5.5 | **Offsite copy configured** | `rclone` or `rsync` offsite copy succeeds or is explicitly waived with justification | ☐ PASS / ☐ FAIL |
| 5.6 | **Retention policy enforced** | Backup dir contains at most 7 `.dump` files (old ones pruned by script) | ☐ PASS / ☐ FAIL |

**Verification commands:**
```bash
# 5.1 — Confirm log rotation on running containers
docker inspect ai-fsm-web --format '{{.HostConfig.LogConfig}}'
# Expected: {json-file map[max-file:3 max-size:50m]}

docker inspect ai-fsm-worker --format '{{.HostConfig.LogConfig}}'
# Expected: {json-file map[max-file:3 max-size:50m]}

# 5.2 — Backup cron
crontab -l | grep backup_db
# Expected: 0 2 * * * /home/pi/scripts/backup_db.sh ...

# 5.3 — Backup script syntax check
bash -n /home/pi/scripts/backup_db.sh && echo "OK"
# Expected: OK (no output from bash -n means no syntax errors)

# 5.4 — Run backup manually
/home/pi/scripts/backup_db.sh
# Expected: "[<timestamp>] Backup written: /home/pi/backups/ai_fsm_<ts>.dump (<size>)"

# 5.6 — Dump count
ls /home/pi/backups/ai_fsm_*.dump | wc -l
# Expected: ≤ 7
```

**Backup retention policy:** 7 days local, 30 days offsite. RPO = 24 hours (daily backup cadence).
**Full procedure:** See [docs/DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) § Backup Configuration.

---

## Section 6 — Restore Validation Drill

This drill must be completed before go-live and repeated at least monthly in production.

| # | Step | Pass Criteria | Result |
|---|------|---------------|--------|
| 6.1 | **Stop app services** | `docker compose -f infra/compose.pi.yml stop web worker` exits cleanly | ☐ PASS / ☐ FAIL |
| 6.2 | **Take pre-restore snapshot** | `pg_dump` of current state written to `/home/pi/backups/pre_restore_<timestamp>.dump` | ☐ PASS / ☐ FAIL |
| 6.3 | **Drop and recreate DB** | `DROP DATABASE ai_fsm; CREATE DATABASE ai_fsm;` succeeds with no active connections | ☐ PASS / ☐ FAIL |
| 6.4 | **Restore from dump** | `pg_restore` completes without fatal errors | ☐ PASS / ☐ FAIL |
| 6.5 | **Row counts reasonable** | Users, jobs, visits, estimates, invoices, payments counts match pre-restore snapshot | ☐ PASS / ☐ FAIL |
| 6.6 | **Health endpoint after restart** | `curl http://localhost:3000/api/health` returns `{"status":"ok","checks":{"db":"ok"}}` | ☐ PASS / ☐ FAIL |
| 6.7 | **Login smoke test after restore** | Admin login succeeds | ☐ PASS / ☐ FAIL |
| 6.8 | **Drill result recorded** | Entry appended to `docs/DECISION_LOG.md` under `DRILL-<date>` | ☐ PASS / ☐ FAIL |

**Full restore procedure:** See [docs/DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) § Restore Procedure.

### Section 6 — Restore Drill Evidence

Complete this template immediately after each drill and paste it into `docs/DECISION_LOG.md` under a `DRILL-<date>` entry.

```
### DRILL-<YYYY-MM-DD>: Restore validation drill
- Date (UTC):
- Operator (agent/human):
- Environment: Pi4 / VPS / local
- Dump file used: ai_fsm_<timestamp>.dump
- Dump file size:
- Restore start time (UTC):
- Restore end time (UTC):
- Restore duration (minutes):

Row counts after restore:
  users:      <n>
  accounts:   <n>
  jobs:       <n>
  visits:     <n>
  estimates:  <n>
  invoices:   <n>
  payments:   <n>
  audit_log:  <n>

Row counts match pre-restore snapshot: YES / NO
  (If NO, describe discrepancy here)

Health check result:
  curl http://localhost:3000/api/health
  Output: <paste JSON response>
  Status: ok / degraded / unreachable

Login smoke test:
  Admin login: PASS / FAIL
  Reason if FAIL:

Post-drill cleanup:
  Pre-restore snapshot deleted: YES / NO / RETAINED
  Services restarted: YES / NO

Issues encountered:
  (none) / <describe any issues and how they were resolved>

Overall result: PASS / FAIL
Next drill scheduled: <YYYY-MM-DD>
```

**Verification commands to run during the drill:**
```bash
# Row counts (run immediately after pg_restore completes, before restarting services)
docker exec -it ai-fsm-postgres psql -U postgres -d ai_fsm -c "
SELECT
  (SELECT count(*) FROM users)      AS users,
  (SELECT count(*) FROM accounts)   AS accounts,
  (SELECT count(*) FROM jobs)       AS jobs,
  (SELECT count(*) FROM visits)     AS visits,
  (SELECT count(*) FROM estimates)  AS estimates,
  (SELECT count(*) FROM invoices)   AS invoices,
  (SELECT count(*) FROM payments)   AS payments,
  (SELECT count(*) FROM audit_log)  AS audit_log;"

# Health check (after restarting web + worker)
curl -sf http://localhost:3000/api/health
# Expected: {"status":"ok","checks":{"db":"ok"},...}

# Login smoke test
curl -si -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<seed-password>"}' \
  | head -5
# Expected: HTTP/1.1 200 OK
```

---

## Section 7 — Observability and Incident Readiness

| # | Check | Pass Criteria | Result |
|---|-------|---------------|--------|
| 7.1 | **Structured JSON logs** | `docker compose logs web \| head -5 \| jq .` parses successfully | ☐ PASS / ☐ FAIL |
| 7.2 | **Error log filtering works** | `docker compose logs web \| jq 'select(.level=="error")'` returns valid JSON for any error-level events | ☐ PASS / ☐ FAIL |
| 7.3 | **Health-check cron configured** | `/home/pi/scripts/healthcheck.sh` is installed and runs via cron every 5 minutes | ☐ PASS / ☐ FAIL |
| 7.4 | **Incident response runbook accessible** | [docs/INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) is current, covers all known failure modes | ☐ PASS / ☐ FAIL |
| 7.5 | **Rollback plan rehearsed** | Rollback drill (re-deploy previous image tag) has been tested end-to-end | ☐ PASS / ☐ FAIL |

---

## Section 8 — Documentation Gates

| # | Check | Pass Criteria | Result |
|---|-------|---------------|--------|
| 8.1 | **DEPLOYMENT_RUNBOOK.md current** | Reflects actual compose file paths and service names | ☐ PASS / ☐ FAIL |
| 8.2 | **INCIDENT_RESPONSE.md current** | Severity levels, runbooks, and escalation flow are accurate | ☐ PASS / ☐ FAIL |
| 8.3 | **CHANGELOG_AI.md updated** | Release task entry appended with gate results and risks | ☐ PASS / ☐ FAIL |
| 8.4 | **DECISION_LOG.md updated** | Any new policy decisions during release prep are recorded | ☐ PASS / ☐ FAIL |

---

## Go-Live Sign-Off

All items in Sections 1–8 must be **PASS** before go-live. Any **FAIL** blocks release.

| Field | Value |
|-------|-------|
| Release commit SHA | |
| CI run URL | |
| Restore drill date | |
| Gate runner (agent/human) | |
| Sign-off timestamp (UTC) | |
| Residual risks accepted | |

**Rollback trigger:** If any P1 incident occurs within 24 hours of go-live, execute the rollback plan in [docs/DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) § Rollback Plan.
