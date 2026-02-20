# Deployment Runbook

Step-by-step guide for deploying ai-fsm to production (Raspberry Pi 4).

---

## Prerequisites

- Raspberry Pi 4 (8GB RAM preferred)
- 64-bit Raspberry Pi OS installed
- External SSD for PostgreSQL data (recommended)
- Docker + Docker Compose plugin installed
- Network access to pull images

---

## 1. First-Time Setup

### 1.1 Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

### 1.2 Create directories

```bash
mkdir -p ~/ai-fsm ~/backups ~/scripts ~/logs
```

### 1.3 Copy environment file

```bash
# On development machine
scp .env pi@<pi-ip>:~/ai-fsm/

# On Pi, verify and edit if needed
cd ~/ai-fsm
nano .env
```

Required variables:
```
DATABASE_URL=postgresql://postgres:<password>@db:5432/ai_fsm
AUTH_SECRET=<min-32-char-secret>
SECURE_COOKIE=true
LOG_LEVEL=info
WORKER_POLL_MS=30000
```

### 1.4 Copy compose file

```bash
# On development machine
scp infra/compose.pi.yml pi@<pi-ip>:~/ai-fsm/
```

---

## 2. Deploy

### 2.1 Pull ARM64 images

```bash
cd ~/ai-fsm
docker compose -f compose.pi.yml pull
```

### 2.2 Start services

```bash
docker compose -f compose.pi.yml up -d
```

### 2.3 Verify startup

```bash
# Check container status
docker compose -f compose.pi.yml ps

# Check health endpoint
curl -sf http://localhost:3000/api/health | jq .

# Check logs
docker compose -f compose.pi.yml logs -f --tail=50
```

Expected output from health check:
```json
{ "status": "ok", "service": "web", "checks": { "db": "ok" }, "ts": "..." }
```

---

## 3. Database Migration

Migrations run automatically on first startup via the init script in the PostgreSQL image.

To verify migrations applied:
```bash
docker exec -it ai-fsm-db psql -U postgres -d ai_fsm -c "SELECT * FROM schema_migrations ORDER BY version;"
```

---

## 4. Seed Initial Data

```bash
# Copy seed script to Pi
scp scripts/db-seed.sh pi@<pi-ip>:~/scripts/

# Run seed
ssh pi@<pi-ip>
chmod +x ~/scripts/db-seed.sh
~/scripts/db-seed.sh
```

---

## 5. Configure Backups

### 5.1 Create backup script

```bash
cat > ~/scripts/backup_db.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/home/pi/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="${BACKUP_DIR}/ai_fsm_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

docker exec ai-fsm-db pg_dump \
  --username=postgres \
  --format=custom \
  --compress=9 \
  ai_fsm > "$FILE"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Remove backups older than 7 days
find "$BACKUP_DIR" -name "ai_fsm_*.dump" -mtime +7 -delete
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Old backups pruned"
EOF

chmod +x ~/scripts/backup_db.sh
```

### 5.2 Add cron job

```bash
crontab -e

# Add this line:
0 2 * * * /home/pi/scripts/backup_db.sh >> /home/pi/logs/backup.log 2>&1
```

---

## 6. Update Deployment

### 6.1 Pull latest code and rebuild

```bash
# On development machine
git pull origin main
pnpm build
docker buildx build --platform linux/arm64 -t ai-fsm-web:latest -f apps/web/Dockerfile .
docker buildx build --platform linux/arm64 -t ai-fsm-worker:latest -f services/worker/Dockerfile .
docker save ai-fsm-web:latest ai-fsm-worker:latest | xz > images.tar.xz
scp images.tar.xz pi@<pi-ip>:~/ai-fsm/

# On Pi
cd ~/ai-fsm
xz -dc images.tar.xz | docker load
docker compose -f compose.pi.yml up -d
```

### 6.2 Rolling update (zero downtime)

```bash
# Pull new images
docker compose -f compose.pi.yml pull

# Recreate containers with new images
docker compose -f compose.pi.yml up -d --force-recreate
```

---

## 7. Rollback

If deployment fails or causes issues:

### 7.1 Rollback to previous image

```bash
# List recent images
docker images | grep ai-fsm

# Tag previous image as latest
docker tag ai-fsm-web:<previous-sha> ai-fsm-web:latest
docker tag ai-fsm-worker:<previous-sha> ai-fsm-worker:latest

# Restart with previous image
docker compose -f compose.pi.yml up -d --force-recreate
```

### 7.2 Rollback database (if migration ran)

```bash
# Restore from backup (see BACKUP_RUNBOOK.md)
docker compose -f compose.pi.yml stop web worker
# ... restore procedure ...
docker compose -f compose.pi.yml start web worker
```

---

## 8. Verify Deployment

Run through the production readiness checklist:

```bash
# Health check
curl -sf http://localhost:3000/api/health

# Login test
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<password>"}' | jq .user.role

# Container status
docker compose -f compose.pi.yml ps

# Resource usage
docker stats --no-stream
```

---

## 9. Troubleshooting

### Container won't start

```bash
# Check logs
docker compose -f compose.pi.yml logs web
docker compose -f compose.pi.yml logs worker

# Check environment
docker compose -f compose.pi.yml config
```

### Database connection failed

```bash
# Check if PostgreSQL is running
docker compose -f compose.pi.yml ps db

# Check PostgreSQL logs
docker compose -f compose.pi.yml logs db

# Test connection
docker exec -it ai-fsm-db psql -U postgres -d ai_fsm -c "SELECT 1;"
```

### Out of memory

```bash
# Check memory
free -h

# Check container limits
docker stats --no-stream

# Reduce worker concurrency or restart containers
docker compose -f compose.pi.yml restart worker
```

---

## 10. Post-Deployment

- [ ] Update CHANGELOG_AI.md with deployment timestamp
- [ ] Verify backup cron job is running
- [ ] Monitor logs for errors over first hour
- [ ] Run E2E smoke tests if available
